// The admin page: submit events and publications, review them, manage roles.
//
// Plain ES modules against Convex's browser bundle (loaded in index.html), so the
// site keeps having no build step. Every query and mutation here is re-checked on
// the server — hiding a tab is a convenience, not a control (convex/authz.ts).
//
// Submitted text is shown to reviewers, so nothing user-supplied goes through
// innerHTML: `el()` sets textContent.

import { initAuth } from "./auth.js";

const { ConvexClient, anyApi: api } = window.convex;

const root = document.getElementById("admin");
// initialAuthTokenReuse: keep the token restored from sessionStorage once Convex
// accepts it, rather than immediately asking for a fresh one (admin/auth.js).
const client = new ConvexClient(root.dataset.convexUrl, { initialAuthTokenReuse: true });

// ------------------------------------------------------------------ helpers

// Document-wide by default: the tabs and account controls are in the admin
// header (_includes/admin-header.html), outside #admin.
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Create an element; strings become text, never markup. */
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

/**
 * A ConvexError carries the server's message for people; anything else is a bug.
 * Matched by name: the browser bundle does not export the ConvexError class.
 */
const message = (error) =>
  error?.name === "ConvexError" ? String(error.data) : error?.message ?? String(error);

const showStatus = (text) => {
  const status = $("#status");
  status.textContent = text ?? "";
  status.hidden = !text;
};

/** Trimmed form values, with empty fields left out rather than sent as "". */
const values = (form, names) => {
  const out = {};
  for (const name of names) {
    const value = form.elements[name].value.trim();
    if (value) out[name] = value;
  }
  return out;
};

const setResult = (form, text, ok) => {
  const result = $("[data-result]", form);
  result.textContent = text;
  result.className = `ms-2 ${ok ? "text-success" : "text-danger"}`;
};

/** Run a form's submit handler with the button disabled and errors reported inline. */
const handleSubmit = (form, handler) =>
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = $("[type=submit]", form);
    button.disabled = true;
    setResult(form, "Submitting…", true);
    try {
      // The event goes along so a form with two submit buttons can tell which.
      setResult(form, await handler(event), true);
      // Paste-to-fill listens for this to move on to the next draft.
      form.dispatchEvent(new CustomEvent("submitted"));
    } catch (error) {
      setResult(form, message(error), false);
    } finally {
      button.disabled = false;
    }
  });

const STATUS_BADGE = {
  pending: "text-bg-warning",
  published: "text-bg-success",
  rejected: "text-bg-danger",
  archived: "text-bg-secondary",
};
const badge = (status) => el("span", { class: `badge ${STATUS_BADGE[status] ?? "text-bg-light"}` }, status);

const when = (ms) => new Date(ms).toLocaleString();

// --------------------------------------------------------------------- tabs

const showTab = (name) => {
  // Only the header's section tabs show which one is open; the account menu's
  // Edit profile item opens a panel without being underlined.
  for (const tab of $$(".dap-tab[data-tab]")) tab.classList.toggle("active", tab.dataset.tab === name);
  for (const panel of $$("[data-panel]")) panel.hidden = panel.dataset.panel !== name;
};
for (const tab of $$("[data-tab]")) {
  tab.addEventListener("click", () => {
    showTab(tab.dataset.tab);
    // On a phone the header is a collapsed menu; close it once a section is picked.
    const menu = $("#adminNav");
    if (menu?.classList.contains("show")) window.bootstrap?.Collapse.getOrCreateInstance(menu).hide();
  });
}

// --------------------------------------------------------- vocabulary lists

client.onUpdate(api.content.eventSeries, {}, (series) => {
  const select = $("#ev-series");
  const current = select.value;
  select.replaceChildren(
    el("option", { value: "" }, "Choose a series…"),
    // "all" is the filter bar's reset button, not a series (convex/content.ts).
    ...series.filter((s) => s.slug !== "all").map((s) => el("option", { value: s.slug }, s.label)),
  );
  select.value = current;
});

/**
 * A checkbox per vocabulary entry, keeping whatever was ticked across a refresh.
 * The vocabulary is closed, so a typo cannot create a filter or badge nothing matches.
 */
const renderChecks = (container, entries, prefix, describe = (e) => e.description) => {
  const checked = new Set($$("input:checked", container).map((i) => i.value));
  container.replaceChildren(
    ...entries.map((entry) =>
      el(
        "div",
        { class: "form-check" },
        el("input", {
          class: "form-check-input",
          type: "checkbox",
          id: `${prefix}-${entry.slug}`,
          value: entry.slug,
          checked: checked.has(entry.slug),
        }),
        el("label", { class: "form-check-label", for: `${prefix}-${entry.slug}`, title: describe(entry) }, entry.label),
      ),
    ),
  );
};
const checkedValues = (container) => $$("input:checked", container).map((input) => input.value);

client.onUpdate(api.content.topics, {}, (topics) => renderChecks($("#topics"), topics, "topic"));
// Research areas first, then department and role badges, as the people grid mixes them.
const FIELD_KIND_ORDER = { research: 0, department: 1, role: 2 };
client.onUpdate(api.content.fields, {}, (fields) => {
  const sorted = [...fields].sort((a, b) => FIELD_KIND_ORDER[a.kind] - FIELD_KIND_ORDER[b.kind]);
  renderChecks($("#fields"), sorted, "field", (f) => f.kind);
  renderChecks($("#profile-fields"), sorted, "profile-field", (f) => f.kind);
  // The badge boxes are rebuilt empty; put the profile's own back.
  if (profile) setChecks($("#profile-fields"), profile.fields);
});

// --------------------------------------------------------------- event form

const addSpeaker = (speaker = {}) => {
  const node = $("#speaker-template").content.firstElementChild.cloneNode(true);
  for (const input of $$("[data-field]", node)) input.value = speaker[input.dataset.field] ?? "";
  $("[data-remove-speaker]", node).addEventListener("click", () => node.remove());
  $("#speakers").append(node);
};
$("[data-add-speaker]").addEventListener("click", () => addSpeaker());
addSpeaker();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches convex/admin.ts

/** Longest side for an uploaded image; people photos render small. */
const PHOTO_SIDE = 480;
const IMAGE_SIDE = 1600;

/**
 * Shrink a photo in the browser before it is uploaded: to `maxSide` pixels on its
 * longest side, JPEGs and WebPs re-encoded as JPEG. PNGs stay PNG (they may be
 * transparent); GIFs and SVGs are left alone, as is anything already small.
 */
const shrink = async (file, maxSide) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // a format this browser cannot decode: upload as is
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  return blob && blob.size < file.size ? blob : file;
};

const uploadImage = async (original, maxSide = IMAGE_SIDE) => {
  const file = await shrink(original, maxSide);
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be under 5 MB.");
  const url = await client.mutation(api.admin.generateUploadUrl, {});
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error(`Image upload failed (${response.status}).`);
  return (await response.json()).storageId;
};

const eventForm = $("#event-form");
handleSubmit(eventForm, async (submit) => {
  const event = values(eventForm, [
    "title",
    "series",
    "startDate",
    "endDate",
    "timeLabel",
    "location",
    "link",
    "description",
  ]);
  const speakers = $$(".speaker", eventForm)
    .map((row) => {
      const speaker = {};
      for (const input of $$("[data-field]", row)) {
        const value = input.value.trim();
        if (value) speaker[input.dataset.field] = value;
      }
      return speaker;
    })
    .filter((s) => Object.keys(s).length > 0);
  if (speakers.some((s) => !s.name)) throw new Error("Every speaker needs a name.");

  const file = eventForm.elements.image.files[0];
  if (file) event.image = await uploadImage(file);

  if (reviewEdits.has(eventForm)) return await saveEdit(eventForm, submit.submitter, { ...event, speakers });
  await client.mutation(api.admin.submitEvent, { ...event, speakers });
  eventForm.reset();
  $("#speakers").replaceChildren();
  addSpeaker();
  return "Submitted. An admin will review it; follow it under Submissions.";
});

// --------------------------------------------------------- publication form

const publicationForm = $("#publication-form");
handleSubmit(publicationForm, async (submit) => {
  const publication = values(publicationForm, [
    "title",
    "venue",
    "pubDate",
    "url",
    "slidesUrl",
    "codeUrl",
    "comment",
  ]);
  const authors = publicationForm.elements.authors.value
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  const topics = checkedValues($("#topics"));

  if (reviewEdits.has(publicationForm)) {
    return await saveEdit(publicationForm, submit.submitter, { ...publication, authors, topics });
  }
  await client.mutation(api.admin.submitPublication, { ...publication, authors, topics });
  publicationForm.reset();
  return "Submitted. An admin will review it; follow it under Submissions.";
});

// -------------------------------------------------------------- person form

/** Non-empty trimmed lines of a textarea. */
const lines = (textarea) =>
  textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const personForm = $("#person-form");
handleSubmit(personForm, async (submit) => {
  const person = values(personForm, [
    "name",
    "category",
    "title",
    "homepage",
    "email",
    "affiliation",
    "bio",
  ]);
  const advisors = lines(personForm.elements.advisors);
  const fields = checkedValues($("#fields"));

  const file = personForm.elements.image.files[0];
  if (file) person.image = await uploadImage(file, PHOTO_SIDE);

  if (reviewEdits.has(personForm)) return await saveEdit(personForm, submit.submitter, { ...person, advisors, fields });
  await client.mutation(api.admin.submitPerson, { ...person, advisors, fields });
  personForm.reset();
  return "Submitted. An admin will review it; follow it under Submissions.";
});

// --------------------------------------------- editing a pending submission
//
// A reviewer's Edit button opens a waiting submission in the same form that adds
// one, filled in the way paste-to-fill fills it. Saving replaces the submission
// (admin:updatePending*), which stays pending; "Save and publish" also publishes it.

const EDITABLE = {
  events: { form: eventForm, tab: "event", kind: "event", update: api.admin.updatePendingEvent },
  publications: { form: publicationForm, tab: "publication", kind: "publication", update: api.admin.updatePendingPublication },
  people: { form: personForm, tab: "people", kind: "person", update: api.admin.updatePendingPerson },
};

/** form → { table, id } while it holds a pending submission rather than a new one. */
const reviewEdits = new Map();

const setEditing = (form, table, row) => {
  if (row) reviewEdits.set(form, { table, id: row._id });
  else reviewEdits.delete(form);
  const banner = $("[data-editing]", form);
  banner.hidden = !row;
  if (row) {
    banner.textContent =
      // A person's `title` is their role ("PhD Student"); their name is what to show.
      `Editing “${table === "people" ? row.name : row.title}”, submitted by ${row.submittedBy}. It stays pending until you publish it.` +
      (row.imageUrl ? " Its image is kept unless you choose a new one." : "");
  }
  $("[data-submit-label]", form).textContent = row ? "Save changes" : "Submit for review";
  for (const node of $$("[data-edit-only]", form)) node.hidden = !row;
  // Quick add would fill the form over the submission being edited.
  const quickAdd = $(`[data-quick-add="${EDITABLE[table].kind}"]`);
  if (quickAdd) quickAdd.hidden = Boolean(row);
};

const clearForm = (form) => {
  form.reset();
  setResult(form, "", true);
  if (form === eventForm) {
    $("#speakers").replaceChildren();
    addSpeaker();
  }
};

const startEditing = (table, row) => {
  const { form, tab, kind } = EDITABLE[table];
  clearForm(form);
  FILL[kind](form, row);
  setEditing(form, table, row);
  showTab(tab);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

const stopEditing = (form) => {
  const edit = reviewEdits.get(form);
  if (!edit) return;
  clearForm(form);
  setEditing(form, edit.table, null);
};

const reviewNote = (text) => {
  const note = $("[data-review-note]");
  note.textContent = text;
  note.hidden = !text;
};

/** Save the form over the submission it holds, then go back to the queue. */
const saveEdit = async (form, submitter, payload) => {
  const { table, id } = reviewEdits.get(form);
  await client.mutation(EDITABLE[table].update, { id, ...payload });
  const publish = submitter?.dataset.save === "publish";
  if (publish) await client.mutation(api.admin.setStatus, { table, id, status: "published" });
  stopEditing(form);
  showTab("submissions");
  reviewNote(publish ? "Saved and published." : "Saved. It is still waiting for review.");
  return "";
};

for (const { form } of Object.values(EDITABLE)) {
  $("[data-cancel-edit]", form).addEventListener("click", () => {
    stopEditing(form);
    showTab("submissions");
  });
}

// ----------------------------------------------------------- paste to fill
//
// Paste an announcement, email, paper list or bio, and the model's reading of it
// fills the form (convex/extract.ts). Nothing is submitted: the person checks the
// fields and submits as usual. One paste can hold several items — three papers,
// two talks — so each becomes a draft, and submitting one loads the next.

/** Put a draft's values into a form's named fields; anything absent is cleared. */
const setFields = (form, draft, names) => {
  for (const name of names) form.elements[name].value = draft[name] ?? "";
};
const setChecks = (container, slugs = []) => {
  for (const box of $$("input[type=checkbox]", container)) box.checked = slugs.includes(box.value);
};

const FILL = {
  event: (form, draft) => {
    setFields(form, draft, ["title", "series", "startDate", "endDate", "timeLabel", "location", "link", "description"]);
    $("#speakers").replaceChildren();
    for (const speaker of draft.speakers ?? []) addSpeaker(speaker);
    if ((draft.speakers ?? []).length === 0) addSpeaker();
  },
  publication: (form, draft) => {
    setFields(form, draft, ["title", "venue", "pubDate", "url", "slidesUrl", "codeUrl", "comment"]);
    form.elements.authors.value = (draft.authors ?? []).join("\n");
    setChecks($("#topics"), draft.topics);
  },
  person: (form, draft) => {
    setFields(form, draft, ["name", "category", "title", "homepage", "email", "affiliation", "bio"]);
    form.elements.advisors.value = (draft.advisors ?? []).join("\n");
    setChecks($("#fields"), draft.fields);
  },
};

const draftTitle = (draft) => draft.title ?? draft.name ?? "Untitled";

const pasteToFill = (kind, form) => {
  const card = $(`[data-quick-add="${kind}"]`);
  const textarea = $("[data-quick-text]", card);
  const button = $("[data-quick-extract]", card);
  const status = $("[data-quick-status]", card);
  const draftList = $("[data-quick-drafts]", card);
  const warnings = $("[data-quick-warnings]", card);

  let items = [];
  let current = -1;
  const done = new Set();

  const setStatus = (text, tone = "muted") => {
    status.textContent = text;
    status.className = tone === "muted" ? "dap-muted" : `text-${tone}`;
  };

  /**
   * Load a draft into the form. `scroll` brings the form into view after an
   * extraction or a submit; picking from the list leaves the page where it is,
   * so the list stays under the pointer.
   */
  const show = (index, { scroll = true } = {}) => {
    current = index;
    const { draft, warnings: notes } = items[index];
    FILL[kind](form, draft);
    setResult(form, "", true);
    warnings.hidden = notes.length === 0;
    warnings.replaceChildren(
      el("strong", {}, "Check before submitting:"),
      el("ul", {}, notes.map((note) => el("li", {}, note))),
    );
    renderList();
    if (scroll) form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderList = () => {
    // A single draft needs no chooser; the form itself is the draft.
    draftList.hidden = items.length < 2;
    draftList.replaceChildren(
      ...items.map((item, index) =>
        el(
          "button",
          {
            type: "button",
            class: `list-group-item list-group-item-action${index === current ? " active" : ""}`,
            disabled: done.has(index),
            onclick: () => show(index, { scroll: false }),
          },
          `${index + 1}. ${draftTitle(item.draft)}`,
          done.has(index) && el("span", { class: "badge text-bg-success ms-2" }, "submitted"),
        ),
      ),
    );
  };

  button.addEventListener("click", async () => {
    button.disabled = true;
    setStatus("Reading… this can take up to a minute.");
    try {
      ({ items } = await client.action(api.extract.fromText, { kind, text: textarea.value }));
      done.clear();
      if (items.length === 0) {
        setStatus(`Couldn't find a ${kind} in that text.`, "danger");
        warnings.hidden = true;
        renderList();
        return;
      }
      setStatus(
        items.length === 1 ? "Filled in below. Check it, then submit." : `Found ${items.length}. The first is filled in below.`,
        "success",
      );
      show(0);
    } catch (error) {
      setStatus(message(error), "danger");
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener("submitted", () => {
    if (current < 0) return;
    done.add(current);
    const next = items.findIndex((_, index) => !done.has(index));
    if (next >= 0) show(next);
    else {
      current = -1;
      warnings.hidden = true;
      renderList();
    }
  });
};

pasteToFill("event", eventForm);
pasteToFill("publication", publicationForm);
pasteToFill("person", personForm);

// ---------------------------------------------------------- my submissions

/** Latest of each subscription, so either one arriving re-renders the whole list. */
const mine = { submissions: { events: [], publications: [], people: [] }, edits: [] };
const renderMine = () => {
  const { events, publications, people } = mine.submissions;
  const edits = mine.edits.map((e) => ({ ...e, title: "Profile update" }));
  const list = (heading, rows) => [
    el("h3", { class: "dap-subsection" }, heading),
    rows.length === 0
      ? el("p", { class: "text-muted" }, "None yet.")
      : el(
          "ul",
          { class: "list-group" },
          rows.map((row) =>
            el(
              "li",
              { class: "list-group-item" },
              badge(row.status),
              " ",
              el("strong", {}, row.title),
              el("span", { class: "text-muted ms-2" }, when(row.submittedAt)),
              row.reviewNote && el("div", { class: "small mt-1" }, `Reviewer: ${row.reviewNote}`),
            ),
          ),
        ),
  ];
  $("#mine").replaceChildren(
    ...list("Events", events),
    ...list("Publications", publications),
    ...list("People", people),
    ...(edits.length > 0 ? list("Your profile", edits) : []),
  );
};

// ------------------------------------------------------------------ review

const reviewActions = (table, row) => {
  const note = el("input", {
    class: "form-control form-control-sm d-inline-block w-auto me-2",
    placeholder: "Note to the submitter (for rejections)",
  });
  const act = (status) => async (event) => {
    const buttons = $$("button", event.target.parentElement);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const reviewNote = note.value.trim() || undefined;
      await client.mutation(api.admin.setStatus, { table, id: row._id, status, reviewNote });
    } catch (error) {
      showStatus(message(error));
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  return el(
    "div",
    { class: "mt-2" },
    note,
    el("button", { type: "button", class: "btn btn-sm dap-btn-quiet me-2", onclick: () => startEditing(table, row) }, "Edit"),
    el("button", { type: "button", class: "btn btn-sm dap-btn-primary me-2", onclick: act("published") }, "Publish"),
    el("button", { type: "button", class: "btn btn-sm dap-remove", onclick: act("rejected") }, "Reject"),
  );
};

const field = (label, value) => value && el("div", {}, el("span", { class: "text-muted" }, `${label}: `), value);
const link = (href) => href && el("a", { href, target: "_blank", rel: "noopener noreferrer" }, href);

const renderEvent = (row) =>
  el(
    "div",
    { class: "queue-item" },
    el(
      "div",
      { class: "d-flex gap-3" },
      row.imageUrl && el("img", { src: row.imageUrl, alt: "" }),
      el(
        "div",
        { class: "flex-grow-1" },
        el("h3", {}, row.title),
        field("Series", row.series),
        field("Date", row.endDate ? `${row.startDate} – ${row.endDate}` : row.startDate),
        field("Time", row.timeLabel),
        field("Where", row.location),
        field("Map", link(row.locationUrl)),
        field("Link", link(row.link)),
        field("Zoom", link(row.zoomUrl)),
        field("Video", link(row.videoUrl)),
        field("Slides", link(row.slidesUrl)),
        row.speakers.flatMap((s) => [
          field(
            "Speaker",
            el("span", {}, [s.name, s.affiliation, s.role].filter(Boolean).join(", "), " ", link(s.url)),
          ),
          s.bio && el("pre", { class: "body mt-1" }, s.bio),
        ]),
        row.description && el("pre", { class: "body mt-2" }, row.description),
        el("div", { class: "small text-muted mt-2" }, `Submitted by ${row.submittedBy}, ${when(row.submittedAt)}`),
      ),
    ),
    reviewActions("events", row),
  );

const renderPublication = (row) =>
  el(
    "div",
    { class: "queue-item" },
    el("h3", {}, row.title),
    field("Authors", row.authors.join(", ")),
    field("Venue", row.venue),
    field("Date", row.pubDate),
    field("URL", link(row.url)),
    field("Website", link(row.websiteUrl)),
    field("Slides", link(row.slidesUrl)),
    field("Code", link(row.codeUrl)),
    field("Topics", row.topics.join(", ")),
    field("Comment", row.comment),
    el("div", { class: "small text-muted mt-2" }, `Submitted by ${row.submittedBy}, ${when(row.submittedAt)}`),
    reviewActions("publications", row),
  );

const CATEGORY_LABELS = {
  faculty: "Faculty",
  postdoc: "Postdoc",
  phd: "PhD",
  student: "M.S./Undergraduate",
  staff: "Staff",
  alum: "Alum",
};

const renderPerson = (row) =>
  el(
    "div",
    { class: "queue-item" },
    el(
      "div",
      { class: "d-flex gap-3" },
      row.imageUrl && el("img", { src: row.imageUrl, alt: "" }),
      el(
        "div",
        { class: "flex-grow-1" },
        el("h3", {}, row.name),
        field("Group", CATEGORY_LABELS[row.category] ?? row.category),
        field("Title", row.title),
        field("Affiliation", row.affiliation),
        field("Homepage", link(row.homepage)),
        field("Email", row.email),
        field("Advisors", row.advisors.join(", ")),
        field("Badges", row.fields.join(", ")),
        row.bio && el("pre", { class: "body mt-2" }, row.bio),
        el("div", { class: "small text-muted mt-2" }, `Submitted by ${row.submittedBy}, ${when(row.submittedAt)}`),
      ),
    ),
    reviewActions("people", row),
  );

const renderProfileEdit = (row) =>
  el(
    "div",
    { class: "queue-item" },
    el(
      "div",
      { class: "d-flex gap-3" },
      row.imageUrl && el("img", { src: row.imageUrl, alt: "New photo" }),
      el(
        "div",
        { class: "flex-grow-1" },
        el("h3", {}, row.name),
        el(
          "table",
          { class: "table table-sm mb-2" },
          el("thead", {}, el("tr", {}, el("th", {}, "Field"), el("th", {}, "Now"), el("th", {}, "Proposed (you can edit)"))),
          el(
            "tbody",
            {},
            row.rows.map((r) =>
              el(
                "tr",
                {},
                el("td", {}, r.field),
                el("td", { class: "dap-muted" }, r.before || "—"),
                el("td", {}, proposedCell(r)),
              ),
            ),
            row.imageUrl && el("tr", {}, el("td", {}, "photo"), el("td", { class: "dap-muted" }, "current"), el("td", {}, "new (shown left)")),
          ),
        ),
        el("div", { class: "small text-muted" }, `Proposed by ${row.submittedBy}, ${when(row.submittedAt)}`),
      ),
    ),
    profileEditActions(row),
  );

/** Text fields are editable in place, so a reviewer can fix a typo before approving. */
const REVISABLE = new Set(["title", "affiliation", "homepage", "bio"]);
const proposedCell = (r) => {
  if (!REVISABLE.has(r.field)) return r.after || "(cleared)";
  const attrs = { class: "form-control form-control-sm", "data-revise": r.field, placeholder: "(cleared)", "aria-label": `Proposed ${r.field}` };
  if (r.field === "bio") return el("textarea", { ...attrs, rows: "4" }, r.after);
  const input = el("input", attrs);
  input.value = r.after;
  return input;
};

const profileEditActions = (row) => {
  const note = el("input", {
    class: "form-control form-control-sm d-inline-block w-auto me-2",
    placeholder: "Note to them (for rejections)",
  });
  const act = (decision) => async (event) => {
    const buttons = $$("button", event.target.parentElement);
    buttons.forEach((b) => (b.disabled = true));
    try {
      // Whatever is in the editable cells when Approve is pressed is what applies.
      const card = event.target.closest(".queue-item");
      const inputs = $$("[data-revise]", card);
      const revised = Object.fromEntries(inputs.map((input) => [input.dataset.revise, input.value.trim() || null]));
      await client.mutation(api.profiles.reviewEdit, {
        id: row._id,
        decision,
        reviewNote: note.value.trim() || undefined,
        revised: decision === "published" && inputs.length > 0 ? revised : undefined,
      });
    } catch (error) {
      showStatus(message(error));
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  return el(
    "div",
    { class: "mt-2" },
    note,
    el("button", { type: "button", class: "btn btn-sm dap-btn-primary me-2", onclick: act("published") }, "Approve"),
    el("button", { type: "button", class: "btn btn-sm dap-remove", onclick: act("rejected") }, "Reject"),
  );
};

const pendingCounts = { events: 0, publications: 0, people: 0, profiles: 0 };
const renderQueue = (table, rows, render) => {
  pendingCounts[table] = rows.length;
  const total = Object.values(pendingCounts).reduce((a, b) => a + b, 0);
  $("[data-pending-count]").textContent = total || "";
  $(`#review-${table}`).replaceChildren(
    // Spread: replaceChildren stringifies an array ("[object HTMLDivElement]").
    ...(rows.length === 0 ? [el("p", { class: "text-muted" }, "Nothing waiting.")] : rows.map(render)),
  );
};

// ------------------------------------------------------------ add yourself

const joinForm = $("#join-form");

/** Where the account's own request stands; the form is for when there is none waiting. */
const renderJoinState = (request) => {
  const state = $("[data-join-state]");
  const waiting = request?.status === "pending";
  const approved = request?.status === "published";
  joinForm.hidden = waiting || approved;
  state.hidden = request === null;
  if (request === null) return;
  state.className = `alert ${waiting ? "alert-info" : approved ? "alert-success" : "alert-warning"}`;
  state.textContent = waiting
    ? `Your profile (${request.name}) is waiting for a lab admin to review it, since ${when(request.submittedAt)}.`
    : approved
      ? "Your profile is approved. Sign out and sign in again to continue as a lab member."
      : `Your last request was not approved${request.reviewNote ? `: ${request.reviewNote}` : "."} You can correct it and submit again.`;
};

handleSubmit(joinForm, async () => {
  const person = values(joinForm, ["name", "category", "title", "homepage", "affiliation", "bio"]);
  const advisors = lines(joinForm.elements.advisors);
  const file = joinForm.elements.image.files[0];
  if (file) person.image = await uploadImage(file, PHOTO_SIDE);
  await client.mutation(api.join.submit, { ...person, advisors });
  joinForm.reset();
  return "Submitted. A lab admin will review it.";
});

$("[data-join-sign-out]").addEventListener("click", () => auth?.signOut());

// ------------------------------------------------------------ edit profile

/** The signed-in person's profile as last loaded; the badge list reads it too. */
let profile = null;

const profileForm = $("#profile-form");
const renderProfile = (loaded) => {
  profile = loaded;
  if (loaded === null) return;
  $("[data-profile-intro]").textContent = loaded.appliesImmediately
    ? `Your People-page profile, ${loaded.name}. As an admin, your changes apply right away.`
    : `Your People-page profile, ${loaded.name}. A lab admin reviews changes before they appear on the site.`;
  $("[data-profile-pending]").hidden = loaded.pendingSince === null;
  // Don't clobber what someone is typing when the subscription refreshes.
  if (!profileForm.contains(document.activeElement)) {
    profileForm.elements.homepage.value = loaded.homepage ?? "";
    profileForm.elements.bio.value = loaded.bio ?? "";
    setChecks($("#profile-fields"), loaded.fields);
  }
  const photo = $("[data-profile-photo]");
  if (loaded.imageUrl) photo.src = loaded.imageUrl.includes("://") ? loaded.imageUrl : new URL(loaded.imageUrl, location.origin).href;
  else photo.removeAttribute("src");
};

handleSubmit(profileForm, async () => {
  const edit = {
    // Title and affiliation are not shown on the People page, so they are not
    // offered here; sending the current values keeps them as they are.
    title: profile?.title ?? "",
    affiliation: profile?.affiliation ?? "",
    homepage: profileForm.elements.homepage.value,
    bio: profileForm.elements.bio.value,
    fields: checkedValues($("#profile-fields")),
  };
  const file = profileForm.elements.image.files[0];
  if (file) edit.image = await uploadImage(file, PHOTO_SIDE);
  const { applied } = await client.mutation(api.profiles.submitProfileEdit, edit);
  profileForm.elements.image.value = "";
  return applied ? "Saved. The People page updates in about a minute." : "Sent for review. An admin will look at it.";
});

// ---------------------------------------------------------------- projects
//
// Admins create and edit the Projects page here (convex/projectAdmin.ts). A new
// project is a draft until published; a published one's short name is fixed.

const projectForm = $("#project-form");

/** A repeatable row (author, link, paper) from its template, filled with `values`. */
const addRow = (kind, values = {}) => {
  const row = $(`#row-${kind}`).content.firstElementChild.cloneNode(true);
  for (const input of $$("[data-field]", row)) input.value = values[input.dataset.field] ?? input.value;
  $("[data-remove-row]", row).addEventListener("click", () => row.remove());
  $(`[data-rows="${kind}"]`).append(row);
};
for (const button of $$("[data-add-row]")) button.addEventListener("click", () => addRow(button.dataset.addRow));

/** The filled-in rows of one kind, as objects of trimmed values; blank rows are dropped. */
const rowValues = (kind) =>
  $$(`[data-rows="${kind}"] .dap-row`)
    .map((row) => Object.fromEntries($$("[data-field]", row).map((i) => [i.dataset.field, i.value.trim()])))
    .filter((r) => Object.entries(r).some(([key, value]) => key !== "kind" && value));

const slugify = (text) =>
  text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** The project in the form, or null for a new one. */
let editing = null;
// While creating, the short name follows the title until someone edits it.
let slugTouched = false;

const setProjectImage = (url) => {
  const img = $("[data-project-image]");
  if (url) img.src = url.includes("://") ? url : new URL(url, location.origin).href;
  else img.removeAttribute("src");
};

const resetProjectForm = () => {
  editing = null;
  slugTouched = false;
  projectForm.reset();
  projectForm.elements.id.value = "";
  projectForm.elements.date.value = new Date().toISOString().slice(0, 10);
  projectForm.elements.slug.readOnly = false;
  for (const kind of ["authors", "links", "papers"]) $(`[data-rows="${kind}"]`).replaceChildren();
  addRow("authors");
  setProjectImage(null);
  $("[data-remove-image-wrap]").hidden = true;
  $("[data-project-heading]").textContent = "New project";
  $("[data-save=draft]").textContent = "Save draft";
  $("[data-save=publish]").hidden = false;
  $("[data-slug-preview]").textContent = "my-project";
  setResult(projectForm, "", true);
};

const loadProject = async (id) => {
  const project = await client.query(api.projectAdmin.get, { id });
  if (project === null) return showStatus("That project no longer exists.");
  resetProjectForm();
  editing = project;
  slugTouched = true;
  const f = projectForm.elements;
  f.id.value = project._id;
  for (const key of ["title", "subtitle", "slug", "date", "body"]) f[key].value = project[key] ?? "";
  f.tags.value = project.tags.join(", ");
  for (const box of $$('input[name="kinds"]', projectForm)) box.checked = project.kinds.includes(box.value);
  $(`[data-rows="authors"]`).replaceChildren();
  for (const author of project.authors) addRow("authors", author);
  if (project.authors.length === 0) addRow("authors");
  for (const link of project.links) addRow("links", link);
  for (const paper of project.publications) addRow("papers", { ...paper, year: paper.year ?? "" });
  setProjectImage(project.imageUrl);
  $("[data-remove-image-wrap]").hidden = !project.hasUploadedImage;
  const published = project.status === "published";
  f.slug.readOnly = published;
  $("[data-slug-preview]").textContent = project.slug;
  $("[data-project-heading]").textContent = `Editing: ${project.title}`;
  $("[data-save=draft]").textContent = published ? "Save changes" : "Save draft";
  $("[data-save=publish]").hidden = published;
  projectForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

projectForm.elements.title.addEventListener("input", () => {
  if (slugTouched || editing?.status === "published") return;
  projectForm.elements.slug.value = slugify(projectForm.elements.title.value);
  $("[data-slug-preview]").textContent = projectForm.elements.slug.value || "my-project";
});
projectForm.elements.slug.addEventListener("input", () => {
  slugTouched = true;
  $("[data-slug-preview]").textContent = projectForm.elements.slug.value || "my-project";
});
projectForm.elements.image.addEventListener("change", () => {
  const file = projectForm.elements.image.files[0];
  if (file) setProjectImage(URL.createObjectURL(file));
});
$("[data-project-new]").addEventListener("click", () => {
  resetProjectForm();
  projectForm.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Upload a picture and put its Markdown where the cursor is in the description.
$("[data-body-image]").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const status = $("[data-body-image-status]");
  status.textContent = "Uploading…";
  try {
    const storageId = await uploadImage(file);
    const body = projectForm.elements.body;
    const at = body.selectionStart ?? body.value.length;
    // A reference, not a URL: the export turns it into the file's address on
    // whichever deployment serves the site (convex/content.ts).
    const markdown = `![${file.name.replace(/\.[^.]+$/, "")}](convex-storage:${storageId})`;
    body.value = body.value.slice(0, at) + markdown + body.value.slice(body.selectionEnd ?? at);
    body.focus();
    body.selectionStart = body.selectionEnd = at + markdown.length;
    status.textContent = "Inserted. Edit the text in [ ] to describe the image.";
  } catch (error) {
    status.textContent = message(error);
  } finally {
    event.target.value = "";
  }
});

handleSubmit(projectForm, async (event) => {
  const f = projectForm.elements;
  const publish = event.submitter?.dataset.save === "publish";
  const project = {
    ...(f.id.value ? { id: f.id.value } : {}),
    title: f.title.value,
    subtitle: f.subtitle.value,
    slug: f.slug.value,
    date: f.date.value,
    kinds: $$('input[name="kinds"]:checked', projectForm).map((box) => box.value),
    tags: f.tags.value.split(","),
    body: f.body.value,
    authors: rowValues("authors").map((a) => ({ name: a.name, ...(a.url ? { url: a.url } : {}) })),
    links: rowValues("links").filter((l) => l.url),
    publications: rowValues("papers").map((p) => ({
      title: p.title,
      venue: p.venue,
      ...(p.url ? { url: p.url } : {}),
      ...(p.year ? { year: Number(p.year) } : {}),
    })),
    ...(f.removeImage.checked ? { removeImage: true } : {}),
  };
  const file = f.image.files[0];
  if (file) project.image = await uploadImage(file);

  const id = await client.mutation(api.projectAdmin.save, project);
  if (publish) await client.mutation(api.projectAdmin.setStatus, { id, published: true });
  await loadProject(id);
  if (publish) return "Published. The Projects page updates in about a minute.";
  return editing?.status === "published" ? "Saved. The live page updates in about a minute." : "Draft saved. It is not on the site until you publish it.";
});

const KIND_LABELS = { project: "Project", software: "Software", benchmark: "Benchmark" };
const renderProjects = (projects) =>
  $("#project-list").replaceChildren(
    ...projects.map((p) => {
      const published = p.status === "published";
      const toggle = el(
        "button",
        {
          type: "button",
          class: `btn btn-sm ${published ? "dap-btn-quiet" : "dap-btn-primary"} ms-2`,
          onclick: async () => {
            try {
              await client.mutation(api.projectAdmin.setStatus, { id: p._id, published: !published });
            } catch (error) {
              showStatus(message(error));
            }
          },
        },
        published ? "Unpublish" : "Publish",
      );
      return el(
        "tr",
        {},
        el(
          "td",
          {},
          published
            ? el("a", { href: `/projects/${p.slug}/`, target: "_blank", rel: "noopener" }, p.title)
            : p.title,
        ),
        el("td", { class: "dap-muted" }, p.kinds.map((k) => KIND_LABELS[k] ?? k).join(", ")),
        el("td", { class: "dap-muted" }, p.date),
        el("td", {}, published ? badge("published") : el("span", { class: "badge text-bg-secondary" }, "draft")),
        el(
          "td",
          { class: "text-end text-nowrap" },
          el("button", { type: "button", class: "btn btn-sm dap-btn-quiet", onclick: () => loadProject(p._id) }, "Edit"),
          toggle,
        ),
      );
    }),
  );

resetProjectForm();

// ------------------------------------------------------------------- users
//
// Two roles. Members add events and publications; admins also review, add
// people, and manage this list. Current lab members on the People page are
// members without being added (convex/authz.ts); the list below shows them.

const ROLE_LABELS = { member: "Member", admin: "Admin" };

/** A row's role, for the select; older fine-grained grants read as what they allow. */
const roleOf = (capabilities) => (capabilities.includes("admin") ? "admin" : "member");

const saveRole = async (email, role) => {
  try {
    await client.mutation(api.admin.setRole, { email, capabilities: role ? [role] : [] });
    showStatus(null);
  } catch (error) {
    showStatus(message(error));
  }
};

const renderRoles = (roles) =>
  $("#roles").replaceChildren(
    ...roles
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((role) => {
        const select = el(
          "select",
          { class: "form-select form-select-sm", "aria-label": `Role for ${role.email}` },
          ...Object.entries(ROLE_LABELS).map(([value, label]) =>
            el("option", { value, selected: roleOf(role.capabilities) === value }, label),
          ),
        );
        select.addEventListener("change", () => saveRole(role.email, select.value));
        return el(
          "tr",
          {},
          el("td", {}, role.email),
          el("td", {}, select),
          el("td", { class: "dap-muted" }, role.grantedBy),
          el(
            "td",
            { class: "text-end" },
            el(
              "button",
              {
                type: "button",
                class: "btn btn-sm dap-remove",
                onclick: () => {
                  if (confirm(`Remove ${role.email}? They will no longer be able to sign in here, unless they are on the People page.`)) {
                    saveRole(role.email, null);
                  }
                },
              },
              "Remove",
            ),
          ),
        );
      }),
  );

const CATEGORY_SHORT = { faculty: "Faculty", postdoc: "Postdoc", phd: "PhD", student: "Student", staff: "Staff" };
const renderLabMembers = (people) => {
  $("[data-lab-count]").textContent = people.length || "";
  $("#lab-members").replaceChildren(
    ...people.map((p) => el("div", {}, p.name, el("span", { class: "dap-muted" }, ` · ${CATEGORY_SHORT[p.category] ?? p.category}`))),
  );
};

/** Every address in pasted text, whatever separates them ("Jane <jd1@columbia.edu>, …"). */
const emailsIn = (text) => [...new Set((text.match(/[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+/g) ?? []).map((e) => e.toLowerCase()))];

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const roleForm = $("#role-form");
handleSubmit(roleForm, async () => {
  const emails = emailsIn(roleForm.elements.emails.value);
  if (emails.length === 0) throw new Error("No email addresses found in that text.");
  const role = roleForm.elements.role.value;
  const { added, changed, unchanged, skipped } = await client.mutation(api.admin.addUsers, { emails, role });
  roleForm.elements.emails.value = skipped.join("\n");
  const parts = [
    added.length && `Added ${plural(added.length, "user")} as ${ROLE_LABELS[role].toLowerCase()}s.`,
    changed.length && `Changed ${plural(changed.length, "user")} to ${ROLE_LABELS[role].toLowerCase()}.`,
    unchanged.length && `${plural(unchanged.length, "user")} already had that role or higher.`,
    skipped.length && `Skipped ${plural(skipped.length, "address", "addresses")} that ${skipped.length === 1 ? "is" : "are"} not @columbia.edu (left in the box above).`,
  ].filter(Boolean);
  return parts.join(" ");
});

// ------------------------------------------------------ who is signed in

/** Subscriptions that only make sense for the current user; dropped on change. */
let subscriptions = [];
const subscribe = (query, args, onResult) =>
  subscriptions.push(client.onUpdate(query, args, onResult, (error) => showStatus(message(error))));

const can = (capabilities, needs) =>
  capabilities.includes("admin") || needs.split(" ").some((c) => capabilities.includes(c));

const renderMe = (me) => {
  for (const unsubscribe of subscriptions) unsubscribe();
  subscriptions = [];

  // Google signed someone in, but not with a Columbia account; the server treats
  // them as signed out, so say why and drop the token.
  if (me.refused) {
    showStatus(`${me.refused} is not a Columbia account. Sign in with your uni@columbia.edu account.`);
    auth?.signOut();
  }

  // A Columbia account that is not on the list may add itself (convex/join.ts);
  // it stays signed in for that, with its own Sign out on the page.
  const joining = Boolean(me.notOnList);
  $("#join").hidden = !joining;
  if (joining) {
    $("[data-join-email]").textContent = me.notOnList;
    const nameInput = joinForm.elements.name;
    if (!nameInput.value && me.name) nameInput.value = me.name;
    subscribe(api.join.myRequest, {}, renderJoinState);
  }

  const signedIn = me.email !== null;
  $("#signed-out").hidden = signedIn || joining;
  $("#signed-in").hidden = !signedIn;
  $("[data-admin-tabs]").hidden = !signedIn;
  $("[data-admin-account]").hidden = !signedIn;
  $("[data-admin-signed-out]").hidden = signedIn;
  if (!signedIn) return;

  $("[data-email]").textContent = me.email;
  $("[data-role]").textContent = me.viewingAsMember
    ? "Member (preview)"
    : me.capabilities.includes("admin")
      ? "Admin"
      : "Member";
  $("[data-role]").classList.toggle("dap-role-preview", me.viewingAsMember);
  $("[data-preview-banner]").hidden = !me.viewingAsMember;
  // Offered to anyone who holds more than member; the server checks the real grant.
  $("li[data-view-as=on]").hidden = me.viewingAsMember || !me.capabilities.some((c) => c !== "member");
  $("li[data-view-as=off]").hidden = !me.viewingAsMember;
  $("[data-role]").title =
    me.via === "people" ? `Signed in as a lab member, matched to ${me.person} on the People page.` : "";

  for (const node of $$("[data-needs]")) {
    // "profile" is about having one to edit, not a capability; admins without a
    // People-page profile have nothing to edit.
    node.hidden = node.dataset.needs === "profile" ? me.profile === null : !can(me.capabilities, node.dataset.needs);
  }
  // Leave a tab the user just lost access to.
  const open = $("[data-panel]:not([hidden])")?.dataset.panel;
  const opener = $(`[data-tab="${open}"]`);
  if (opener?.closest("[data-needs]")?.hidden) showTab("event");

  subscribe(api.admin.mySubmissions, {}, (rows) => {
    mine.submissions = rows;
    renderMine();
  });
  subscribe(api.profiles.myEdits, {}, (rows) => {
    mine.edits = rows;
    renderMine();
  });
  if (me.profile !== null) subscribe(api.profiles.myProfile, {}, renderProfile);
  if (can(me.capabilities, "events")) {
    subscribe(api.admin.pending, { table: "events" }, (rows) => renderQueue("events", rows, renderEvent));
  }
  if (can(me.capabilities, "people")) {
    subscribe(api.admin.pending, { table: "people" }, (rows) => renderQueue("people", rows, renderPerson));
    subscribe(api.profiles.pendingEdits, {}, (rows) => renderQueue("profiles", rows, renderProfileEdit));
  }
  if (can(me.capabilities, "publications")) {
    subscribe(api.admin.pending, { table: "publications" }, (rows) =>
      renderQueue("publications", rows, renderPublication),
    );
  }
  if (me.capabilities.includes("admin")) {
    subscribe(api.admin.listRoles, {}, renderRoles);
    subscribe(api.admin.labMembers, {}, renderLabMembers);
    subscribe(api.projectAdmin.list, {}, renderProjects);
  }
};

/** Set once Google sign-in has loaded; renderMe may run before that. */
let auth;

client.onUpdate(api.authz.me, {}, renderMe, (error) => showStatus(message(error)));

auth = await initAuth({
  client,
  googleClientId: root.dataset.googleClientId,
  button: $("#google-button"),
  onChange: (signedIn) => {
    if (signedIn) showStatus(null);
  },
}).catch((error) => showStatus(message(error)));

$("[data-sign-out]").addEventListener("click", () => auth?.signOut());

// Preview as a member, or stop. authz:me updates on its own and renderMe redraws
// the page, so there is nothing to do here but ask.
for (const node of $$("[data-view-as]")) {
  const button = node.matches("button") ? node : $("button", node);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await client.mutation(api.authz.setViewingAsMember, { on: node.dataset.viewAs === "on" });
    } catch (error) {
      showStatus(message(error));
    } finally {
      button.disabled = false;
    }
  });
}
