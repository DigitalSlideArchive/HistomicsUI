#!/bin/bash

set -e

export SETUPTOOLS_SCM_PRETEND_VERSION=`python -m setuptools_scm | sed "s/.* //"`
if [ "${CIRCLE_BRANCH-:}" = "master" ]; then
    export SETUPTOOLS_SCM_PRETEND_VERSION=`echo $SETUPTOOLS_SCM_PRETEND_VERSION | sed "s/\+.*$//"`
elif [ "${CIRCLE_BRANCH-:}" = "girder-5" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    pip install setuptools-scm
    export SETUPTOOLS_SCM_PRETEND_VERSION=$(python "$SCRIPT_DIR/get_version.py")
fi

python -m build
twine check dist/*
twine upload --skip-existing dist/*
