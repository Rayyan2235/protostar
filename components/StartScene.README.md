# StartScene

New part: the Protostar world. A night sky with a young star forming in its dust cloud, a dark ridge, and one small figure watching. It is drawn as flat SVG silhouette layers on top of LivingSky.

Why: it is the start screen's one loud moment. It comes from the product's own name and uses no borrowed art.

**The consumer provides:** an optional `className`. The height is `space-8` + `space-5` (240px) and the radius is `radius-lg`.

* Use it only on the start screen (an empty state). Never put it inside working screens or behind forms.
* The young star breathes slowly and the stars drift. Both stop when motion is off or the scene is off screen.
* It is composed for wide frames: everything sits low enough that a wide crop never cuts off the star.
* Colours come only from `land`, `glow`, `on-art` and `sky-*`, mixed with `color-mix` where a shade is needed.
