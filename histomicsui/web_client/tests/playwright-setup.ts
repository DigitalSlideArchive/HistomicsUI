import fs from 'fs';

import type {FullConfig} from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default (_config: FullConfig) => {
    if (fs.existsSync('coverage')) {
        fs.rmSync('coverage', {recursive: true, force: true});
    }
    fs.mkdirSync('coverage/data', {recursive: true});
};
