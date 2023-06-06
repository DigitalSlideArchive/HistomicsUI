import os

from setuptools import find_packages, setup

with open('README.rst') as readme_file:
    readme = readme_file.read()


def prerelease_local_scheme(version):
    """
    Return local scheme version unless building on master in CircleCI.

    This function returns the local scheme version number
    (e.g. 0.0.0.dev<N>+g<HASH>) unless building on CircleCI for a
    pre-release in which case it ignores the hash and produces a
    PEP440 compliant pre-release version number (e.g. 0.0.0.dev<N>).
    """
    from setuptools_scm.version import get_local_node_and_date

    if os.getenv('CIRCLE_BRANCH') in ('master', ):
        return ''
    else:
        return get_local_node_and_date(version)


setup(
    name='histomicsui',
    use_scm_version={'local_scheme': prerelease_local_scheme, 'fallback_version': '0.0.0'},
    setup_requires=['setuptools-scm'],
    description='Organize, visualize, and analyze histology images.',
    author='Kitware, Inc.',
    author_email='kitware@kitware.com',
    classifiers=[
        'Development Status :: 5 - Production/Stable',
        'License :: OSI Approved :: Apache Software License',
        'Natural Language :: English',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
    ],
    install_requires=[
        'girder-large-image-annotation>=1.13.0',
        'girder-slicer-cli-web>=1.2.3',
        'cachetools',
        'importlib-metadata<5 ; python_version < "3.8"',
        'orjson',
    ],
    extras_require={
        'analysis': [
            'girder-slicer-cli-web[girder]>=1.2.3',
        ],
    },
    license='Apache Software License 2.0',
    long_description=readme,
    long_description_content_type='text/x-rst',
    include_package_data=True,
    keywords='girder-plugin, histomicsui',
    packages=find_packages(exclude=['test', 'test.*']),
    url='https://github.com/DigitalSlideArchive/histomicsui',
    zip_safe=False,
    python_requires='>=3.6',
    entry_points={
        'girder.plugin': [
            'histomicsui = histomicsui:GirderPlugin'
        ],
        'girder_worker_plugins': [
            'slicer_cli_web = histomicsui.girder_worker_plugin:HistomicsUIWorkerPlugin'
        ]
    },
)
