Configuration Options
=====================

YAML Configuration Files
------------------------

See the `large_image <https://github.com/girder/large_image/blob/master/docs/girder_config_options.rst>`_ documentation for general yaml configuration file details on specifying different values for different users and groups.

.histomicsui_config.yaml
~~~~~~~~~~~~~~~~~~~~~~~~

This is used to specify annotation groups available for marking annotations.

::

    ---
    annotationGroups:
      # If replaceGroups isn't present or false, groups will be merged with
      # existing groups.  Those that have the same name will be updated.  If
      # true, then all existing groups are removed.
      replaceGroups: true
      # The name of the default group.  If an existing annotation does not have
      # a group, it will be given this group name.
      defaultGroup: default
      groups:
        -
          # The id is required.
          id: default
          # The fillColor and lineColor are of the form
          # "rgb(<red>, <green>, <blue>)" or
          # "rgba(<red>, <green>, <blue>, <alpha>)"
          # where the colors are on a scale of 0 to 255 and the alpha is from
          # 0 to 1.
          fillColor: rgba(0,0,0,0)
          lineColor: rgb(0,0,0)
          # lineWidth is in pixels
          lineWidth: 2
        -
          id: Sample
          # Label is optional.
          label: Sample Label
          fillColor: rgba(0, 0, 0, 0.47)
          lineColor: rgb(255, 80, 238)
          lineWidth: 4
        -
          id: Red
          fillColor: rgba(255, 0, 0, 0.25)
          lineColor: rgb(255, 0, 0)
          lineWidth: 2
        -
          id: Green
          fillColor: rgba(0, 128, 0, 0.25)
          lineColor: rgb(0, 128, 0)
          lineWidth: 2
        -
          id: Blue
          fillColor: rgba(0, 0, 255, 0.25)
          lineColor: rgb(0, 0, 255)
          lineWidth: 2

Girder Configuration
--------------------

There is a histomicsui section that can be added to the Girder configuration file::

    [histomicsui]
    # If restrict_downloads is True, only logged-in users can access download
    # and tiles/images endpoints.  If this is a number, file and item download
    # endpoints can be used by anonymous users for files up to the specified
    # size in bytes.  This setting does not affect logged-in users.
    restrict_downloads = False
