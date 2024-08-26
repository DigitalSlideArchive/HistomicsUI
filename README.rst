===========
HistomicsUI
===========

|build-status| |codecov-io| |doi-badge|

.. |build-status| image:: https://circleci.com/gh/DigitalSlideArchive/HistomicsUI.svg?style=svg
    :target: https://circleci.com/gh/DigitalSlideArchive/HistomicsUI
    :alt: Build Status

.. |codecov-io| image:: https://img.shields.io/codecov/c/github/DigitalSlideArchive/HistomicsUI.svg
    :target: https://codecov.io/github/DigitalSlideArchive/HistomicsUI?branch=master
    :alt: codecov.io

.. |doi-badge| image:: https://img.shields.io/badge/DOI-10.5281%2Fzenodo.5474914-blue.svg
   :target: https://zenodo.org/doi/10.5281/zenodo.5474914

Organize, visualize, and analyze histology images.

`HistomicsUI`_ organizes and manages whole slide image (WSI) files using Girder_.  It has a dedicated interface to select WSI, add annotations manually, and to run analysis and algorithms on all or parts of images.

Girder provides authentication, access control, and diverse storage options, including using local file systems and Amazon S3.  WSI images are read and displayed via the large_image_ module.  Algorithms are containerized using Docker_ and are run using the slicer_cli_web_ Girder plugin.  These can be run on multiple worker machines via `Girder Worker`_ and celery_.

A set of common algorithms are provided by HistomicsTK_.

License
-----------------------------------------------------------

HistomicsUI is made available under the Apache License, Version 2.0. For more details, see `LICENSE <https://github.com/DigitalSlideArchive/HistomicsUI/blob/master/LICENSE>`_

Community
-----------------------------------------------------------

`Discussions <https://github.com/DigitalSlideArchive/digital_slide_archive/discussions>`_ | `Issues <https://github.com/DigitalSlideArchive/HistomicsUI/issues>`_ | `Contact Us <https://www.kitware.com/contact-us/>`_

Installation
------------

Linux
=====

In linux with Python 3.8 or newer:

Prerequisites:

- MongoDB must be installed and running.
- An appropriate version of Python must be installed.

HistomicsUI uses large_image sources to read different image file formats.  You need to install appropriate sources for the files that will be used.

.. code-block:: bash

  # install all sources from the main repo
  pip install large-image[sources] --find-links https://girder.github.io/large_image_wheels

or

.. code-block:: bash

  # install openslide and tiff sources
  pip install large-image-source-tiff large-image-source-openslide --find-links https://girder.github.io/large_image_wheels

Now install the histomicsui package, have Girder build its UI, and start the Girder server.  Note that at Girder may still require an old version of node (14.x) to build correctly -- nvm can be used to manage multiple versions of node.

.. code-block:: bash

  pip install histomicsui[analysis]
  girder build
  girder serve

To use Girder Worker:

.. code-block:: bash

  pip install girder_slicer_cli_web[worker]
  GW_DIRECT_PATHS=true girder-worker -l info -Ofair --prefetch-multiplier=1

Girder Worker needs the rabbitmq message service to be running to communicate with Girder.  Both Girder and Girder Worker should be run as a user that is a member of the docker group.

The first time you start HistomicsUI, you'll also need to configure Girder with at least one user and one assetstore (see the Girder_ documentation).  Additionally, it is recommended that you install the HistomicsTK_ algorithms.  This can be done going to the Admin Console, Plugins, Slicer CLI Web settings.  Set a default task upload folder, then import the ``dsarchive/histomicstk:latest`` docker image.

Reference Deployment
====================

The standard deployment of HistomicsUI is the `Digital Slide Archive`_.  The associated repository has tools for readily installing via Docker, VirtualBox, or shell scripts on Ubuntu.

Development
===========

The most convenient way to develop on HistomicsUI is to use the `devops scripts from the Digital Slide Archive <https://github.com/DigitalSlideArchive/digital_slide_archive/tree/master/devops>`_.

If you are making changes to the HistomicsUI frontend, you can make Girder watch the source code and perform hot reloads on changes using the ``--watch-plugin`` argument to ``girder build``. See the `Girder docs <https://girder.readthedocs.io/en/stable/development.html#during-development>`_ for more information.

Annotations and Metadata from Jobs
----------------------------------

This handles ingesting annotations and metadata that are uploaded and associating them with existing large image items in the Girder database.  These annotations and metadata are commonly generated through jobs, such as HistomicTK tasks, but can also be added manually.

If a file is uploaded to the Girder system that includes a ``reference`` record, and that ``reference`` record contains an ``identifier`` field and at least one of a ``fileId`` and an ``itemId`` field, specific identifiers can be used to ingest the results.  If a ``userId`` is specified in the ``reference`` record, permissions for adding the annotation or metadata are associated with that user.

Metadata
========

Identifiers ending in ``ItemMetadata`` are loaded and then set as metadata on the associated item that contains the specified file.  Conceptually, this is the same as calling the ``PUT`` ``item/{id}/metadata`` endpoint.

Annotations
===========

Identifiers ending in ``AnnotationFile`` are loaded as annotations, associated with the item that contains the specified file.  Conceptually, this is the same as uploaded the file via the annotation endpoints for the item associated with the specified ``fileId`` or ``itemId``.

If the annotation file contains any annotations with elements that contain ``girderId`` values, the ``girderId`` values can be ``identifier`` values from files that were uploaded with a ``reference`` record that contains a matching ``uuid`` field.  The ``uuid`` field is required for this, but is treated as an arbitrary string.


Funding
-------
This work was funded in part by the NIH grant U24-CA194362-01_.

.. _HistomicsUI: https://github.com/DigitalSlideArchive/HistomicsUI
.. _Docker: https://www.docker.com/
.. _Kitware: https://www.kitware.com/
.. _U24-CA194362-01: http://grantome.com/grant/NIH/U24-CA194362-01

.. _Girder: http://girder.readthedocs.io/en/latest/
.. _Girder Worker: https://girder-worker.readthedocs.io/en/latest/
.. _large_image: https://github.com/girder/large_image
.. _slicer_cli_web: https://github.com/girder/slicer_cli_web
.. _celery: http://www.celeryproject.org/
.. _HistomicsTK: https://github.com/DigitalSlideArchive/HistomicsTK
.. _Digital Slide Archive: https://github.com/DigitalSlideArchive/digital_slide_archive
