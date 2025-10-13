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

</style>


# DAPLab Blog

<ul>
  {% for post in site.posts %}
    <li>
      <a href="{{ post.url }}">{{post.date|date: "%m/%d/%y"}} {{ post.title }}</a>
      <!--<p>{{ post.excerpt }}</p>-->
    </li>
  {% endfor %}
</ul>

