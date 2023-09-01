Mouse and Keyboard Controls
===========================

Basic Image Controls
--------------------

- **Pan**:

  - **Left-drag**: Hold down the left mouse button and drag the image to change
    the area that is in view.

  - **Middle-drag**: Hold down the middle mouse button and drag the image to
    change the area that is in view.  This works even when editing annotations.

  - **Single touch drag**

  - **Arrow keys**: The arrow keys (up, down, left, right) to nudge the area in
    view one screen pixel.  If you hold down shift, arrow keys will move the
    view area half a screen size.  Shift+ctrl and arrow keys will move an
    intermediate amount.

- **Zoom**:

  - **Right-drag**: Hold down the right mouse button and drag up or down to
    change the current zoom level.

  - **Mouse wheel**: The mouse wheel changes the current zoom level.

  - **Multi-touch spread or contract**

  - **Plus**, **minus**: The plus and minus keys will also zoom the image by
    1/20th of a power of 2.  If shift is held down, they will zoom by a power
    of 2.  If shift+ctrl is held down, they zoom the image by 1/4th of a power
    of 2.

  - **1 - 7**: The number keys 1 - 7 will zoom to discrete zoom levels.  1
    zooms all the way out, and each successive number zooms further in by a
    power of 8.

  - **Shift-left-drag**, **shift-right-drag**: Zoom into or out of the selected
    rectangle.

- **Rotate**:

  - **Left-ctrl-drag**: Hold down ctrl and the left mouse button to rotate the
    image.

  - **Ctrl-mouse wheel**: Hold down ctrl and use the mouse wheel to rotate the
    image.

  - **Multi-touch rotate**

  - **<**, **>**: < and > (also . or ,) rotate the image a small amount.  If
    shift is held down, < and > rotate the image 90 degrees.

  - **0**: 0 returns the image to the default orientation.

Overview Image Controls
-----------------------

- **Pan**:

  - **Left-drag**: Hold down the left mouse button and drag anywhere inside the
    view rectangle to change the area that is in view.

  - **Left-click**: Left click anywhere in the overview window to recenter the
    main image around that point.

- **Zoom**:

  - **Shift-left-drag**: Draw a rectangle on the overview and the entire area
    selected area will be shown in the main image.  If shift is held
    throughout, the selection is constrained to a square.  If shift is released
    after start, the selection can be any rectangle.

Annotation Controls
-------------------

- **Show / hide all annotations**:

  - **a**: If any annotations are not visible, show all annotations.  If all
    annotations are being shown, hide all annotations.

- **Select annotation**:

  - **Right click**: right clicking on an annotation element will show a
    context menu allowing the annotation element's style group to be changed,
    or to edit its shape or properties, or to delete it.  If more than one
    element is selected, the context menu will be applied to all selected
    elements.

  - **m**: Show the context menu for the currently selected annotations, if
    any.  If no annotations are selected, show the context menu for the
    annotation under the mouse cursor.

  - **s**: Switch to area select mode.  Left-drag a rectangle around a group of
    annotation elements to select them.

  - **S**: Switch to area select polygon mode.  Draw a polygon around a group of
    annotation elements to select them.

  - **C**: Clear current selection.

  - **Ctrl-left click**: toggle whether an individual annotation element is
    selected.

- **New annotation**:

  - **space**: Show the new annotation dialog.  This is the same as clicking
    the "New" button.

- **Draw an annotation element**:

  - **o**, **r**, **i**, **c**, **p**, **l**, **b**: Switch to point,
    rectangle, ellipse, circle, polygon, line, or brush drawing mode.  If
    already in that mode, turn off drawing mode.

    - **shift**: When drawing a rectangle or an ellipse, after starting to draw
      it, holding down shift will adjust it to a square or circle.

  - **enter**: While drawing a line or polygon annotation element, finish
    drawing, closing the polygon or terminating the line.

  - **esc**: Cancel drawing an annotation element.

- **Edit / modify annotation shape**:

  - **e**: While the mouse is over the annotation element, typing e will put it
    in edit mode.  This is the same as selecting "Edit Shape" from the context
    menu.

  - **shift**: When drawing an annotation element with area (e.g., all but
    points and lines), switch to **Add** mode.  This needs to be held down when
    the annotation is started (the first point in a polygon, rectangle, etc.).
    When the annotation element is finished, it will be combined with any
    existing elements in the same annotation document and the same style group.

    .. image:: images/union.gif
       :width: 256
       :alt: Union operation

  - **ctrl**: When drawing an annotation element with area, switch to
    **Subtract** mode.  The drawing annotation will be removed from any
    existing elements in the same annotation document and the same style group.

    .. image:: images/difference.gif
       :width: 256
       :alt: Difference operation

  - **shift+ctrl**: When drawing an annotation element with area, switch to
    **Union** mode.  The drawing annotation will be combined with nearby
    existing annotation elements in the same annotation document and the same
    style group, only keeping area that is in both the new and existing
    elements.

    .. image:: images/intersect.gif
       :width: 256
       :alt: Intersect operation

  - **shift+alt**: When drawing an annotation element with area, switch to
    **XOR** mode.  The drawing annotation will be combined with nearby
    existing annotation elements in the same annotation document and the same
    style group, keeping areas that is in either but not both the new and
    existing elements and removing areas that are in both.

    .. image:: images/xor.gif
       :width: 256
       :alt: Xor operation

- **Brush controls**:

  The brush drawing tool always combines with existing annotation elements in
  the current annotation and style.

  - **B**: Cycle through the brush shapes (square and circle)

  - **[**, **]**: Change the size of the brush.

- **Change Style Group**:

  - **q**, **w**: Change the currently selected style group by cycling though
    available options.

- **Pixelmap controls**

  **Left-click** on a superpixel to change its category to the current style group.
  Holding **shift** and **left-drag** the mouse to change multiple superpixels as
  the mouse passed over them.

Frame Selector Controls
-----------------------

- **Channel/band controls**:

  When compositing channels or bands, the visibility of individual channels or
  bands can be toggled.

  - **ctrl+<number>** toggles the visibility of channels / bands 1 through 10.

  - **alt+ctrl+<number>** toggles the visibility of channels / bands 11 through 20.
