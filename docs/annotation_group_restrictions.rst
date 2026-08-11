Restricting Annotations to Allowed Groups
==========================================

An annotation document can restrict which style groups its elements may be assigned to by setting an ``allowed_groups`` key in the annotation's ``attributes``:

::

    {
      "name": "restricted annotation",
      "attributes": {
        "allowed_groups": ["groupA", "groupB"]
      },
      "elements": [...]
    }

``allowed_groups`` may also be given as a JSON-stringified array for convenience when setting it through the UI metadata editor:

::

    {
      "attributes": {
        "allowed_groups": "[\"groupA\", \"groupB\"]"
      }
    }

When this restriction is present, the Draw panel and the annotation element context menu will only offer the listed groups instead of every style group that exists.

Validation
----------

``allowed_groups`` is only honored when it is a non-empty array of non-empty strings, or a string that parses as JSON into such an array. Any other value - a missing key, a non-array/non-JSON-array value, an unparseable string, an empty array, or an array containing no valid strings - is treated as *unrestricted*, and every existing style group is offered as usual. Duplicate entries are ignored.

Auto-creation of missing groups
--------------------------------

If ``allowed_groups`` names a style group that does not yet exist, it is automatically created the first time the restriction is encountered, by copying the style (fill color, line color, line width, pattern) of the default group. The newly created groups are persisted immediately. This can happen from either the Draw panel or the annotation context menu, whichever sees the restricted annotation first.

Effect on the current selection
--------------------------------

- **Draw panel**: If the currently active style group is not one of the annotation's allowed groups, the Draw panel automatically switches to the first allowed group that exists.
