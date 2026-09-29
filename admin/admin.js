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

const $ = (selector, scope = root) => scope.querySelector(selector);
const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];

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
      setResult(form, await handler(), true);
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
  for (const tab of $$("[data-tab]")) tab.classList.toggle("active", tab.dataset.tab === name);
  for (const panel of $$("[data-panel]")) panel.hidden = panel.dataset.panel !== name;
};
for (const tab of $$("[data-tab]")) tab.addEventListener("click", () => showTab(tab.dataset.tab));

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
client.onUpdate(api.content.fields, {}, (fields) =>
  renderChecks(
    $("#fields"),
    [...fields].sort((a, b) => FIELD_KIND_ORDER[a.kind] - FIELD_KIND_ORDER[b.kind]),
    "field",
    (f) => f.kind,
  ),
);

// --------------------------------------------------------------- event form

const addSpeaker = () => {
  const node = $("#speaker-template").content.firstElementChild.cloneNode(true);
  $("[data-remove-speaker]", node).addEventListener("click", () => node.remove());
  $("#speakers").append(node);
};
$("[data-add-speaker]").addEventListener("click", addSpeaker);
addSpeaker();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches convex/admin.ts

const uploadImage = async (file) => {
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
handleSubmit(eventForm, async () => {
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

  await client.mutation(api.admin.submitEvent, { ...event, speakers });
  eventForm.reset();
  $("#speakers").replaceChildren();
  addSpeaker();
  return "Submitted. An editor will review it; track it under My submissions.";
});

// --------------------------------------------------------- publication form

const publicationForm = $("#publication-form");
handleSubmit(publicationForm, async () => {
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

  await client.mutation(api.admin.submitPublication, { ...publication, authors, topics });
  publicationForm.reset();
  return "Submitted. An editor will review it; track it under My submissions.";
});

// -------------------------------------------------------------- person form

/** Non-empty trimmed lines of a textarea. */
const lines = (textarea) =>
  textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const personForm = $("#person-form");
handleSubmit(personForm, async () => {
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
  if (file) person.image = await uploadImage(file);

  await client.mutation(api.admin.submitPerson, { ...person, advisors, fields });
  personForm.reset();
  return "Submitted. An editor will review it; track it under My submissions.";
});

// ---------------------------------------------------------- my submissions

const renderMine = ({ events, publications, people }) => {
  const list = (heading, rows) => [
    el("h5", { class: "mt-3" }, heading),
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
    el("button", { type: "button", class: "btn btn-sm btn-success me-2", onclick: act("published") }, "Publish"),
    el("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: act("rejected") }, "Reject"),
  );
};

const field = (label, value) => value && el("div", {}, el("span", { class: "text-muted" }, `${label}: `), value);
const link = (href) => href && el("a", { href, target: "_blank", rel: "noopener noreferrer" }, href);

const renderEvent = (row) =>
  el(
    "div",
    { class: "card card-body mb-3 queue-item" },
    el(
      "div",
      { class: "d-flex gap-3" },
      row.imageUrl && el("img", { src: row.imageUrl, alt: "" }),
      el(
        "div",
        { class: "flex-grow-1" },
        el("h5", {}, row.title),
        field("Series", row.series),
        field("Date", row.endDate ? `${row.startDate} – ${row.endDate}` : row.startDate),
        field("Time", row.timeLabel),
        field("Where", row.location),
        field("Link", link(row.link)),
        row.speakers.map((s) =>
          field(
            "Speaker",
            el("span", {}, [s.name, s.affiliation, s.role].filter(Boolean).join(", "), " ", link(s.url)),
          ),
        ),
        row.description && el("pre", { class: "body mt-2" }, row.description),
        el("div", { class: "small text-muted mt-2" }, `Submitted by ${row.submittedBy}, ${when(row.submittedAt)}`),
      ),
    ),
    reviewActions("events", row),
  );

const renderPublication = (row) =>
  el(
    "div",
    { class: "card card-body mb-3 queue-item" },
    el("h5", {}, row.title),
    field("Authors", row.authors.join(", ")),
    field("Venue", row.venue),
    field("Date", row.pubDate),
    field("URL", link(row.url)),
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
    { class: "card card-body mb-3 queue-item" },
    el(
      "div",
      { class: "d-flex gap-3" },
      row.imageUrl && el("img", { src: row.imageUrl, alt: "" }),
      el(
        "div",
        { class: "flex-grow-1" },
        el("h5", {}, row.name),
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

const pendingCounts = { events: 0, publications: 0, people: 0 };
const renderQueue = (table, rows, render) => {
  pendingCounts[table] = rows.length;
  const total = pendingCounts.events + pendingCounts.publications + pendingCounts.people;
  $("[data-pending-count]").textContent = total || "";
  $(`#review-${table}`).replaceChildren(
    rows.length === 0 ? el("p", { class: "text-muted" }, "Nothing waiting.") : rows.map(render),
  );
};

// ------------------------------------------------------------------- roles

const roleForm = $("#role-form");
const editRole = (role) => {
  roleForm.elements.email.value = role.email;
  for (const box of $$("#role-capabilities input")) box.checked = role.capabilities.includes(box.value);
  roleForm.elements.email.focus();
};

const renderRoles = (roles) =>
  $("#roles").replaceChildren(
    ...roles
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((role) =>
        el(
          "tr",
          {},
          el("td", {}, role.email),
          el("td", {}, role.capabilities.join(", ")),
          el("td", { class: "text-muted" }, role.grantedBy),
          el(
            "td",
            {},
            el("button", { type: "button", class: "btn btn-sm btn-link", onclick: () => editRole(role) }, "Edit"),
          ),
        ),
      ),
  );

roleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!roleForm.reportValidity()) return;
  const capabilities = $$("#role-capabilities input:checked").map((box) => box.value);
  try {
    await client.mutation(api.admin.setRole, { email: roleForm.elements.email.value, capabilities });
    roleForm.reset();
    showStatus(null);
  } catch (error) {
    showStatus(message(error));
  }
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

  const signedIn = me.email !== null;
  $("#signed-out").hidden = signedIn;
  $("#signed-in").hidden = !signedIn;
  $("#whoami").hidden = !signedIn;
  if (!signedIn) return;

  $("[data-email]").textContent = me.email;
  if (!me.canSubmit) {
    showStatus(`${me.email} is not a Columbia account. Sign out and sign in with uni@columbia.edu.`);
  }

  for (const node of $$("[data-needs]")) node.hidden = !can(me.capabilities, node.dataset.needs);
  // Leave a tab the user just lost access to.
  const active = $("[data-tab].active");
  if (active.closest("[data-needs]")?.hidden) showTab("event");

  subscribe(api.admin.mySubmissions, {}, renderMine);
  if (can(me.capabilities, "events")) {
    subscribe(api.admin.pending, { table: "events" }, (rows) => renderQueue("events", rows, renderEvent));
  }
  if (can(me.capabilities, "people")) {
    subscribe(api.admin.pending, { table: "people" }, (rows) => renderQueue("people", rows, renderPerson));
  }
  if (can(me.capabilities, "publications")) {
    subscribe(api.admin.pending, { table: "publications" }, (rows) =>
      renderQueue("publications", rows, renderPublication),
    );
  }
  if (me.capabilities.includes("admin")) subscribe(api.admin.listRoles, {}, renderRoles);
};

client.onUpdate(api.authz.me, {}, renderMe, (error) => showStatus(message(error)));

const auth = await initAuth({
  client,
  googleClientId: root.dataset.googleClientId,
  button: $("#google-button"),
  onChange: (signedIn) => {
    if (signedIn) showStatus(null);
  },
}).catch((error) => showStatus(message(error)));

$("[data-sign-out]").addEventListener("click", () => auth?.signOut());
