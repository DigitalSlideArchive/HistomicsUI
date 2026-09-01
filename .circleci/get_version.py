import re

import setuptools_scm


def main():
    version = setuptools_scm.get_version()
    expected_version_regex = r'(\d+\.\d+\.\d+)a(\d+).+$'
    match = re.match(expected_version_regex, version)
    if not match:
        error_message = f'Version {version} does not match the expected format'
        raise ValueError(error_message)
    base_version = match.group(1)
    alpha_version = match.group(2)
    print(f'{base_version}a{alpha_version}')


if __name__ == '__main__':
    main()
