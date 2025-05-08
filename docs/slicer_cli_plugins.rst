Slicer CLI Web Plugins
======================

HistomicsUI can run algorithms that are packaged in containers and conform to the Slicer CLI Execution model.  Once installed, these are listed in the ``Analyses`` menu.  In order to work with the HistomicsUI system, the containers must conform to some minimum standards.

The main standard is `Slicer Execution Schema <https://www.slicer.org/w/index.php?title=Documentation/Nightly/Developers/SlicerExecutionModel>`_, with additions documented in the `Girder slicer_cli_web <https://github.com/girder/slicer_cli_web?tab=readme-ov-file#docker-clis>`_ package and in the main `HistomicsUI <https://github.com/DigitalSlideArchive/HistomicsUI?tab=readme-ov-file#annotations-and-metadata-from-jobs>`_ package.  Those references should be considered primary.

To install and use HistomicsUI, see the instructions at the `Digital Slide Archive <https://github.com/DigitalSlideArchive/digital_slide_archive/tree/master/devops/dsa#readme>`_.

Summary
-------

Slicer CLI Web Plugins are typically docker images that contain any number of algorithms, where each algorithm receives a set of inputs and produces some outputs.  Algorithms can be self contained, or can interact with Girder or other external systems.

At a minimal, doing:

.. code-block:: bash

  docker run {image/name} --list_cli

must produce a json dictionary where the keys are the names of the available algorithms and the values are additional information about how those algorithms needs to run.  For example, ``docker run --rm dsarchive/histomicstk:latest --list_cli`` generates:

.. code-block:: json

  {
    "ColorDeconvolution": {
      "type": "python"
    },
    "SeparateStainsXuSnmf": {
      "type": "python"
    },
    "NucleiDetection": {
      "type": "python"
    },
    "ComputeNucleiFeatures": {
      "type": "python"
    },
    "NucleiClassification": {
      "type": "python"
    },
    "BackgroundIntensity": {
      "type": "python"
    },
    "SeparateStainsMacenkoPCA": {
      "type": "python"
    },
    "PositivePixelCount": {
      "type": "python"
    },
    "SuperpixelSegmentation": {
      "type": "python"
    }
  }


For each algorithm, doing:

.. code-block:: bash

  docker run {image/name} {algorithm} --xml

returns xml that describes the algorithm and its command line interface.  For example ``docker run --rm dsarchive/histomicstk:latest NucleiDetection --xml`` generates (truncated as an example):

.. code-block:: xml

  <?xml version="1.0" encoding="UTF-8"?>
  <executable>
    <title>Detects Nuclei</title>
    <description>Detects nuclei in a whole-slide image</description>
    <category>HistomicsTK</category>
    <version>0.1.0</version>
    <documentation-url>https://digitalslidearchive.github.io/HistomicsTK/</documentation-url>
    <license>Apache 2.0</license>
    <contributor>Deepak Roy Chittajallu (Kitware), Neal Siekierski (Kitware)</contributor>
    <acknowledgements>This work is part of the HistomicsTK project.</acknowledgements>
    <parameters>
      <label>IO</label>
      <description>Input/output parameters</description>
      <image>
        <name>inputImageFile</name>
        <label>Input Image</label>
        <description>Input image</description>
        <channel>input</channel>
        <index>0</index>
      </image>
      <region>
        <name>analysis_roi</name>
        <label>Analysis ROI</label>
        <description>
          Region of interest within which the analysis should be done. Must be a four element
          vector in the format "left, top, width, height" in the space of the base layer.  Default
          value of "-1, -1, -1, -1" indicates that the whole image should be processed.
        </description>
        <longflag>analysis_roi</longflag>
        <default>-1,-1,-1,-1</default>
      </region>
      <string-enumeration>
        <name>nuclei_annotation_format</name>
        <label>Nuclei annotation format</label>
        <description>Format of the output nuclei annotations</description>
        <longflag>nuclei_annotation_format</longflag>
        <element>bbox</element>
        <element>boundary</element>
        <default>boundary</default>
      </string-enumeration>
      <file fileExtensions=".anot" reference="inputImageFile">
        <name>outputNucleiAnnotationFile</name>
        <label>Output Nuclei Annotation File</label>
        <description>Output nuclei annotation file (*.anot)</description>
        <channel>output</channel>
        <index>1</index>
      </file>
    </parameters>
    <parameters advanced="true">
      ...
    </parameters>
  </executable>

Requirements for the XML File
-----------------------------

For each algorithm, an xml file with the specification of the inputs and outputs of an algorithm is required, as detailed below.

Many python algorithms use the ``CLIArgumentParser`` class to facilitate parsing the command line.  This can be imported via ``from ctk_cli import CLIArgumentParser``.  There are some ``slicer_cli_web`` specific extensions to the format; to use those, do ``from slicer_cli_web import CLIArgumentParser`` instead.  This has the virtue that the algorithm can parse the command line based on the xml.  This might look like:

.. code-block:: python

  from slicer_cli_web import CLIArgumentParse

  if __name__ == '__main__':

      args = CLIArgumentParser().parse_args()
      # The parsed arguments can be accessed by the return value attributes
      # value = args.parameter_name

Alternatively, an algorithm can parse the command line itself, using the xml purely to inform programs that run the algorithm what parameters are required or available.

Overall Section
+++++++++++++++

There are several requirements for the xml.  At the minimum, it needs to contain a top level ``executable`` node containing a ``title`` and a ``description``.  This top level node will also always contain one or more ``parameter`` nodes (see below)i.  It can optionally contain ``license``, ``contributor``, ``acknowledgements`` (these three are used as part of the internal description), ``version``, (reported when ``--version`` is specified), ``category``, ``documentation-url``, ``index`` (these three are mostly ignored).  These optional nodes are expected to contain text.

The minimal example is:

.. code-block:: xml

  <?xml version="1.0" encoding="UTF-8"?>
  <executable>
    <title>My Algorithm title</title>
    <description>My algorithm description</description>
    <parameters>
      ...
    </parameters>
  </executable>

Parameter Sections
++++++++++++++++++

Parameters consist of all of the inputs and outputs for the algorithm.  A parameter node must have ``label`` and ``description`` nodes.  It may contain an ``advanced`` attribute that is a binary value of ``true`` or ``false``.  User interfaces use this to determine whether the parameters should be exposed by default.  The parameter block contains any number of ``value`` nodes.

The minimal example is:

.. code-block:: xml

  <parameters advanced="false">
    <label>A block of parameters</label>
    <description>A description of why these parameters are grouped together</description>
    ...
  </parameters>

Value Nodes
+++++++++++

There are many different value types that can be specified.  This is one of the places where the xml description is richer than the expression that is possible in a simple posix-style command description.  Available value types are ``boolean``, ``integer``, ``float``, ``double``, ``string``, ``integer-vector``, ``float-vector``, ``double-vector``, ``string-vector``, ``integer-enumeration``, ``float-enumeration``, ``double-enumeration``, ``string-enumeration``, ``region``, ``directory``, ``file``, ``image``, ``item`` (added by slicer_cli_web), ``point``, ``pointfile``, ``transform``, ``table``, ``measurement``, ``geometry`` (these last six are not supported by slicer_cli_web).

Each value node must contain ``name``, ``description``, and ``label``.  ``name`` is the attribute name once the value is parsed.  ``label`` is the short title displayed to a user.  ``description`` clarifies the intent of the value.

Value Elements
~~~~~~~~~~~~~~

Additional elements are used to add parameters to the value.  These are:

* ``channel``: this is either ``input`` or ``output``.  Any value other than ``output`` or unspecified is the same as ``input``.  The ``directory``, ``file``, ``image``, or ``item`` expect a path as their command line values.  For inputs this is expected to exist.  For outputs this will be created or written to as appropriate.  For all other value types, if output is specified, the parsed parameter will have a ``returnParameterFile`` attribute that will have a path where these values can be written.

* ``index``: as with most command line tools, some arguments can be positional and some can be optionally specified by flags.  Positional arguments have an ``index``, and should unique have a 0-based integer.  That is, no two values should use the same index and there should be no gaps in index values.  Values that have a specified ``index`` are *required*.

* ``longflag``: if ``index`` is **not** specified, at least one of ``longflag`` and ``flag`` must be specified.  This is the long form of the name of command line property.  For instance, if ``longflag`` is ``<longflag>format</longflag>``, then the command line will take a ``--format=...`` parameter.  A leading ``--`` is optional as part of the longflag text.  Values specified with a ``longflag`` or ``flag`` are *optional*.

* ``flag``: this is the short form of the name of a command line property.  A leading ``-`` is optional.  For instance, if ``flag`` is ``<flag>ft</flag>``, then the command line will take a ``-f ...`` parameter.

* ``default``: a default value for an optional parameter.  The slicer_cli_web module expects default values for vectors and enumerations.

* ``element``: enumeration values have one or more ``element`` elements that list the allowed values.  The ``default`` should be one of these.

  * ``constraints``: constraints can be specified for any scalar value or scale vector values (i.e., for ``integer``, ``float``, ``double``).  A constraints node contains a ``step`` element and optionally ``minimum`` and/or ``maximum`` elements.

Value Attributes
~~~~~~~~~~~~~~~~

Some value nodes can have additional attributes.  These are:

* ``multiple``: is a binary value of ``true`` or ``false``.  A value where multiple is true can be specified multiple times.

* ``coordinateSystem``: this is used for ``point`` and ``pointfile`` values and is ignored by slicer_cl_web.

* ``fileExtensions``: a comma-separated list of expected file extensions for any of the ``file``, ``image``, or ``item`` values.

* ``reference``: this is mostly a slicer_cli_web extension.  For value types of ``directory``, ``file``, ``image``, or ``item``, if this is ``_girder_id_``, then value will be passed as a Girder ID string rather than converted to a Girder resource.  Otherwise, if this is the ``name`` of another value, the current parameter value will reference the other value.  This can be used, for instance, to associate annotations with parent images.

* ``subtype``: used by ``image`` and ``geometry`` values.  slicer_cli_web ignores this value.

* ``shapes``: used by ``region`` values; a slicer_cli_web extension.  A comma-separated list of values that can include ``default``, ``rectangle``, ``polygon``, ``line``, ``polyline``, and ``point``, plus ``multi`` and one of ``submit`` (or ``submitoff``), ``submiton``, or ``autosubmit``.

  In the official schema, region is a vector of six values of the form x,y,z,rx,ry,rz, defining a rectangle based on its center and radius in each of three dimensions.  This is the ``default`` shape.

  The ``rectangle`` shape allows a vector of four values defining a rectangle of the form x,y,width,height, where x,y is the left and top of the rectangle in pixel coordinates.  Many algorithms that accept this value accept -1,-1,-1,-1 as a default to specify the whole conceptual space.

  The ``polygon`` shape allows for a list of x,y values.  Polygons must always have at least four points so that the vector of values cannot be confused with the default; repeat the first vertex at the end to specify a triangle.

  The ``line`` shape allows a two-vertex line.  To disambiguate this from a rectangle, the values -2,-2 are added after the line.

  The ``polyline`` shape allows a multi vertex line, indicated again by a -2,-2 value after the line.

  A ``point`` is a single vertex.

  ``multi`` allow multiple shapes, indicated by separating coordinates of each shape by -1,-1.  Note that neither -1,-1 nor -2,-2 are allowed as coordinates within a shape -- to use those, specify them with decimals (e.g., -1.0,-1.0).

  The submit options will add suggestions on how the UI should handle changes.  If present, the option to auto-run a job as soon as a valid shape is set should be present.  ``autosubmit`` means this should always happen.  ``submit`` or ``submitoff`` offers this as a setting but is default to not submit the job.  ``submiton`` offers this as a setting and defaults to submitting the job.

* ``defaultNameMatch``, ``defaultPathMatch``, ``defaultRelativePath``: used by ``image``, ``file``, ``item``, and ``directory`` values.  ``defaultNameMatch`` and ``defaultPathMatch`` are regular expressions designed to give a UI a value to match to prepopulate default values from files or paths that match the regex.  ``defaultNameMatch`` is intended to match the final path element, whereas ``defaultPathMatch`` is used on the entire path as a combined string.  ``defaultRelativePath`` is used to find a value that has a path relative to some base.  In the Girder UI, this might be from an item.

* ``datalist``: this applies to ``string`` values and is a slicer_cli_web extension.

  If this is present, when the CLI is first loaded or, possibly periodically after parameters have been changed, the CLI may be called with optional parameters. The CLI is expected to return a new-line separated list of values that can be used as recommended inputs. As an example, a ``string`` input might have a ``datalist`` of ``{"enumerate-options": "true"}``; the cli would be called with the existing parameters PLUS the extra parameter specified by datalist. If the result is sensible, the input control would expose this list to the user. The datalist property is a json-encoded dictionary that overrides other parameters. This should override parameters that aren't needed to be resolved to produce the datalist (e.g., input and output files) as that will speed up the call. The CLI should respond to the modified call with a response that contains multiple ``<element>some text</element>`` values that will be the suggested data for the control.

A Note About Booleans
~~~~~~~~~~~~~~~~~~~~~

Booleans specify a true or false value after the flag or long flag.  The Slicer Execution Schema states that booleans should be false by default and the presence of the flag should make them true.  The ``ctk_cli`` specifies that they take a single ``true`` or ``false`` parameter.  This doesn't change the xml; it changes what is passed to the CLI.  Instead of passing ``--longflag`` to set the flag to true, ``--longflag true`` must be passed.  Since slicer_cli_web inherits from ``ctk_cli``, that convention is expected.

Special Value Names
~~~~~~~~~~~~~~~~~~~

The ``name`` element of a value node can have a special name to gain additional functionality.

* ``girderApiUrl`` and ``girderToken``: as a slicer_cli_web extension, if these values are not specified or blank, they are populated with the appropriate url and token so that a running job could use girder_client to communicate with Girder.

* Ending in ``ItemMetadata``: as a HistomicsUI extension, if the value has a ``reference`` to an ``image`` input, the output file is ingested as a large_image annotation on the input image.  If the annotation file contains any annotations with elements that contain ``girderId`` values, the ``girderId`` values can be identifier values from files that were uploaded with a reference record that contains a matching ``uuid`` field.  The ``uuid`` field is required for this, but is treated as an arbitrary string

* Ending in ``AnnotationFile``: as a HistomicsUI extension, if the value has a ``reference`` to an ``item`` or ``image`` input, the output file is ingested as metadata on the input item or image.

Templated Inputs
~~~~~~~~~~~~~~~~

Most value parameter that takes a value can be specified with a Jinja2-style template string.  This is documented in the slicer_cli_web repository.

XML Validation
++++++++++++++

From python, you can validate one of the slicer_cli_web xml files by doing:

.. code-block:: python

    from slicer_cli_web import CLIArgumentParser

    CLIArgumentParser(<path to xml>)

Any warnings should be corrected.

Examples
--------

See the CLIs in `HistomicsTK <https://github.com/DigitalSlideArchive/HistomicsTK/tree/master/histomicstk/cli>`_ as some examples.

Common Issues
-------------

``docker run {image/name} --list_cli`` or ``docker run {image/name} {algorithm} --xml`` returns data besides the expected json or xml.  For instance, printing debug values during this process will prevent using the docker image.
