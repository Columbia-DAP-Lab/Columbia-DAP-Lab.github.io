---
layout: page
color: '#0c6a99'
logo: Blog
urlprefix: .
---
<style>
.peach { background: #FBE5D6; }
.blue { background: #B4C7E7; }

ul li {
  margin-bottom: 1em;         /* Nice spacing between items */
  padding-left: 0px;            /* Ensure no left padding */
}

ul li a:hover {
  color: white;
  background: #012169;
  background: #009EFF;
}


ul {
  list-style: none;           /* Remove bullets */
  padding-left: 0;            /* Remove left margin/padding */
  margin-left: 0;             /* Remove left margin */
}

.date-pill {
  display: inline-block;
  /*border: 1px solid #009eff;*/
  color: #009eff;
  /*padding: 0.25em 0.6em;*/
  border-radius: 100px;      /* Fully rounded pill shape */
  font-size: 0.85em;
  font-weight: 600;
  margin-right: 0.75em;       /* Space between pill and title */
}

ul li a {
  text-decoration: underline;
  color: inherit;
}

ul li a:hover {
  color: white;
  background: #012169;
  padding: 0.25em 0.5em;
  border-radius: 4px;
}

</style>


# DAPLab Blog

<ul style="margin-left: 0px; padding-left: 0px; margin-top: 1em;">
  {% for post in site.posts %}
    {% if post.published != false %}
  <li style="margin-bottom: 1em">
  <span class="date-pill">{{post.date|date: "%m/%d/%y"}}</span>
  <a href="{{ post.url }}">{{ post.title }}</a>
</li>
    {% endif %}
  {% endfor %}
</ul>

