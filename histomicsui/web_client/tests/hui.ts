import fs from 'fs';
import path from 'path';

import {expect, type Page} from '@playwright/test';

import {sampleDataDir, testDataDir, waitForDialog, waitForFocused} from './util';

// HistomicsUI-specific helpers for the Playwright tests.
//
// The Jasmine tests that these replaced created a set of resources on the
// server from python before each spec ran (see `setupResources`) and drove
// the HistomicsUI app through a `huiTest` global.  Here the resources are
// created through the REST API, and the app is driven through the page.  The
// app instance is exposed as `window.histomicsApp` for use with `evalApp`.

export const SAMPLE_SVS = 'sample_svs_image.TCGA-DU-6399-01A-01-TS1.e8eb65de-d63e-42db-af6f-14fefbbdf7bd.svs';

export const ADMIN = {login: 'admin', password: 'password', email: 'admin@girder.test', firstName: 'Admin', lastName: 'Admin'};
export const USER = {login: 'user', password: 'password', email: 'user@girder.test', firstName: 'User', lastName: 'User'};

export interface Resources {
    adminId: string;
    adminToken: string;
    userId: string;
    userToken: string;
    /* The 'image' item in the user's Public folder */
    imageId: string;
    /* The 'copy' item in the user's Public folder */
    copyId: string;
    /* The 'Empty' item in the admin's Public folder */
    emptyId: string;
    /* The public 'admin annotation' on the image */
    adminAnnotationId: string;
    /* The user's public 'subfolder', containing a config file and image.svs */
    subfolderId: string;
    subfolderImageId: string;
}

export interface RestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    token?: string;
    /* query parameters */
    params?: Record<string, string | number | boolean>;
    /* form-encoded body */
    form?: Record<string, string | number | boolean>;
    /* JSON body */
    json?: unknown;
    /* raw body */
    body?: Buffer | string;
    headers?: Record<string, string>;
    /* resolve with the raw text rather than parsed JSON */
    raw?: boolean;
}

export const getOrigin = (page: Page) => new URL(page.url()).origin;

/**
 * Make a request to the Girder REST API of the server the page is on.
 */
export const rest = async (page: Page, url: string, options: RestOptions = {}) => {
    const headers: Record<string, string> = {...(options.headers || {})};
    if (options.token) {
        headers['Girder-Token'] = options.token;
    }
    const resp = await page.request.fetch(`${getOrigin(page)}/api/v1/${url.replace(/^\//, '')}`, {
        method: options.method || 'GET',
        headers,
        params: options.params,
        form: options.form as Record<string, string | number | boolean>,
        data: options.json !== undefined ? JSON.stringify(options.json) : options.body,
        ...(options.json !== undefined ? {headers: {...headers, 'Content-Type': 'application/json'}} : {})
    });
    if (!resp.ok()) {
        throw new Error(`${options.method || 'GET'} ${url} failed with ${resp.status()}: ${await resp.text()}`);
    }
    if (options.raw) {
        return resp.text();
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
};

/**
 * Call girder.rest.restRequest inside the page, using the page's current
 * authentication.  Resolves with the response body.
 */
export const pageRest = async (page: Page, opts: {url: string, method?: string, data?: unknown, contentType?: string}) => {
    return page.evaluate((opts) => new Promise((resolve, reject) => {
        const {data, contentType, ...rest} = opts;
        const req: Record<string, unknown> = {...rest};
        if (contentType) {
            req.contentType = contentType;
            req.processData = false;
            req.data = JSON.stringify(data);
        } else if (data !== undefined) {
            req.data = data;
        }
        // @ts-ignore
        window.girder.rest.restRequest(req).done(resolve).fail((resp: {responseText: string}) => reject(new Error(resp.responseText)));
    }), opts);
};

export const createUserApi = async (page: Page, user: typeof ADMIN) => {
    const resp = await rest(page, 'user', {method: 'POST', form: user});
    return resp;
};

export const getToken = async (page: Page, login: string, password: string = 'password'): Promise<string> => {
    const resp = await rest(page, 'user/authentication', {
        headers: {Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`}
    });
    return resp.authToken.token;
};

export const getFolder = async (page: Page, token: string, parentType: string, parentId: string, name: string) => {
    const folders = await rest(page, 'folder', {token, params: {parentType, parentId, name}});
    expect(folders).toHaveLength(1);
    return folders[0];
};

/**
 * Upload a local file into a folder, returning the new file document.
 */
export const uploadFileApi = async (page: Page, token: string, folderId: string, filePath: string, name?: string) => {
    const data = fs.readFileSync(filePath);
    const upload = await rest(page, 'file', {
        method: 'POST',
        token,
        form: {
            parentType: 'folder',
            parentId: folderId,
            name: name || path.basename(filePath),
            size: data.length,
            mimeType: 'application/octet-stream'
        }
    });
    return rest(page, 'file/chunk', {
        method: 'POST',
        token,
        params: {uploadId: upload._id, offset: 0},
        body: data,
        headers: {'Content-Type': 'application/octet-stream'}
    });
};

/**
 * Upload a local file into a folder and make it a large image item.
 */
export const uploadImageApi = async (page: Page, token: string, folderId: string, filePath: string, name?: string) => {
    const file = await uploadFileApi(page, token, folderId, filePath, name);
    let item = await rest(page, `item/${file.itemId}`, {token});
    if (!item.largeImage) {
        await rest(page, `item/${file.itemId}/tiles`, {method: 'POST', token, params: {fileId: file._id}});
        item = await rest(page, `item/${file.itemId}`, {token});
    }
    expect(item.largeImage).toBeTruthy();
    return item;
};

/**
 * Create the users and resources that the Jasmine tests used to get from the
 * python test fixtures: an admin and a regular user, an 'image' large image
 * item and a 'copy' of it in the user's Public folder, an 'Empty' item in the
 * admin's Public folder, a public annotation owned by the admin, and a public
 * 'subfolder' holding a .histomicsui_config.yaml and an image.svs.
 *
 * This must be called from a page on the Girder web client of a fresh server.
 */
export const setupResources = async (page: Page): Promise<Resources> => {
    const admin = await createUserApi(page, ADMIN);
    const adminToken = await getToken(page, ADMIN.login, ADMIN.password);
    const user = await createUserApi(page, USER);
    const userToken = await getToken(page, USER.login, USER.password);

    const adminPublic = await getFolder(page, adminToken, 'user', admin._id, 'Public');
    const empty = await rest(page, 'item', {method: 'POST', token: adminToken, form: {folderId: adminPublic._id, name: 'Empty'}});

    const userPublic = await getFolder(page, userToken, 'user', user._id, 'Public');
    const image = await uploadImageApi(page, userToken, userPublic._id, path.join(sampleDataDir, SAMPLE_SVS), 'image');
    const copy = await rest(page, `item/${image._id}/copy`, {method: 'POST', token: userToken, form: {name: 'copy'}});

    const annotation = await rest(page, 'annotation', {
        method: 'POST', token: adminToken, params: {itemId: image._id}, json: {name: 'admin annotation'}
    });
    await rest(page, `annotation/${annotation._id}/access`, {
        method: 'PUT', token: adminToken, form: {access: JSON.stringify({users: [], groups: []}), public: true}
    });

    const subfolder = await rest(page, 'folder', {
        method: 'POST', token: userToken, form: {parentType: 'user', parentId: user._id, name: 'subfolder', public: true}
    });
    await uploadFileApi(page, userToken, subfolder._id, path.join(testDataDir, '.histomicsui_config.yaml'));
    const subImage = await uploadImageApi(page, userToken, subfolder._id, path.join(sampleDataDir, SAMPLE_SVS), 'image.svs');

    return {
        adminId: admin._id,
        adminToken,
        userId: user._id,
        userToken,
        imageId: image._id,
        copyId: copy._id,
        emptyId: empty._id,
        adminAnnotationId: annotation._id,
        subfolderId: subfolder._id,
        subfolderImageId: subImage._id
    };
};

/**
 * Register the two test CLIs (NucleiDetection and ComputeNucleiFeatures) as
 * if they came from the huirchive/histomicstk:latest docker image, so that
 * they are listed by `slicer_cli_web/docker_image`.  That endpoint only
 * reports CLIs in a tag folder inside an image folder, so those are created
 * (publicly) in the user's Public folder; the CLI items themselves must be
 * created by an admin.
 */
export const createTestAnalyses = async (page: Page, resources: Resources, image = 'huirchive/histomicstk', tag = 'latest') => {
    const publicFolder = await getFolder(page, resources.userToken, 'user', resources.userId, 'Public');
    const imageFolder = await rest(page, 'folder', {
        method: 'POST',
        token: resources.userToken,
        form: {parentType: 'folder', parentId: publicFolder._id, name: image, public: true}
    });
    await rest(page, `folder/${imageFolder._id}/metadata`, {
        method: 'PUT', token: resources.userToken, json: {slicerCLIType: 'image'}
    });
    const tagFolder = await rest(page, 'folder', {
        method: 'POST',
        token: resources.userToken,
        form: {parentType: 'folder', parentId: imageFolder._id, name: tag, public: true}
    });
    await rest(page, `folder/${tagFolder._id}/metadata`, {
        method: 'PUT', token: resources.userToken, json: {slicerCLIType: 'tag'}
    });
    for (const [name, specFile] of [
        ['NucleiDetection', 'test_analysis_detection.xml'],
        ['ComputeNucleiFeatures', 'test_analysis_features.xml']
    ]) {
        const spec = fs.readFileSync(path.join(testDataDir, specFile)).toString('base64');
        await rest(page, 'slicer_cli_web/cli', {
            method: 'POST',
            token: resources.adminToken,
            form: {
                folder: tagFolder._id,
                image: `${image}:${tag}`,
                name,
                desc_type: 'xml',
                spec,
                replace: false
            }
        });
    }
    return tagFolder;
};

/**
 * Wait for the HistomicsUI app to have loaded on the current page.
 */
export const waitForApp = async (page: Page) => {
    await page.waitForFunction(() => {
        // @ts-ignore
        return !!window.histomicsApp && !!window.histomicsApp.bodyView;
    });
};

/**
 * Navigate to the HistomicsUI app.  `query` is added to the app's hash
 * query (for instance, `{image: id}`).
 */
export const gotoHistomics = async (page: Page, query: Record<string, string> = {}, webroot = 'histomics') => {
    const search = new URLSearchParams(query).toString();
    await page.goto(`${getOrigin(page)}/${webroot}${search ? '#?' + search : ''}`);
    await waitForApp(page);
};

/**
 * Log in through the HistomicsUI header.
 */
export const huiLogin = async (page: Page, login: string = USER.login, password: string = USER.password) => {
    await page.locator('.g-login').click();
    await waitForDialog(page);
    await waitForFocused(page, '#g-login');
    await page.locator('#g-login').fill(login);
    await page.locator('#g-password').fill(password);
    await page.locator('#g-login-button').click();
    await expect(page.locator('.h-user-dropdown-link')).toContainText(login);
    await expect(page.locator('#g-dialog-container')).toBeHidden();
};

/**
 * Log out through the HistomicsUI header.
 */
export const huiLogout = async (page: Page) => {
    await page.locator('.h-user-dropdown-link').click();
    await page.locator('.g-logout').click();
    await expect(page.locator('.g-login')).toBeVisible();
};

/**
 * Wait for the viewer to show the given image.
 */
export const waitForImage = async (page: Page, imageId: string) => {
    await expect(page.locator('.geojs-layer.active').first()).toBeAttached();
    await expect(page.locator(`a.g-item-breadcrumb-link[data-id="${imageId}"]`)).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
        // @ts-ignore
        return window.girder.plugins.histomicsui.router.getQuery('image');
    })).toBe(imageId);
    await page.waitForFunction(() => {
        // @ts-ignore
        return window.girder.rest.numberOutstandingRestRequests() === 0;
    });
};

/**
 * Open an image through the "Open image" dialog, starting from the current
 * user's folders.  `folders` is the list of folders to descend through
 * (defaults to ['Public']).  Resolves with the id of the opened image.
 */
export const openImage = async (page: Page, name: string, folders: string[] = ['Public']) => {
    await page.locator('.h-open-image').click();
    await waitForDialog(page);
    const userId = await page.evaluate(() => {
        // @ts-ignore
        return window.girder.auth.getCurrentUser().id;
    });
    await page.locator('#g-root-selector').selectOption(userId);
    for (const folder of folders) {
        await page.locator('#g-dialog-container .g-folder-list-link', {hasText: folder}).click();
        await waitForDialog(page);
    }
    const item = page.locator('#g-dialog-container .g-item-list-link.li-column-record-name', {hasText: new RegExp(`^\\s*${name}\\s*$`)});
    await expect(item).toHaveCount(1);
    const href = await item.locator('xpath=following-sibling::*[1]').getAttribute('href');
    const imageId = (href || '').match(/item\/([a-f0-9]{24})/)?.[1];
    expect(imageId).toBeTruthy();
    await item.click();
    await expect(page.locator('#g-selected-model')).not.toHaveValue('');
    await page.locator('#g-dialog-container .g-submit-button').click();
    await expect(page.locator('#g-dialog-container')).toBeHidden();
    await waitForImage(page, imageId as string);
    return imageId as string;
};

/**
 * Run a function inside the page with the HistomicsUI app instance as its
 * first argument.  The function must be self-contained (it is serialized), but
 * `arg` is passed through to it.
 */
export const evalApp = async <T, A>(page: Page, fn: (app: any, arg: A) => T, arg?: A): Promise<T> => {
    return await page.evaluate(
        ({fnBody, arg: innerArg}) => {
            // @ts-ignore
            const app = window.histomicsApp;
            // eslint-disable-next-line no-new-func
            const fn = new Function('app', 'arg', `return (${fnBody})(app, arg);`) as (app: unknown, arg: unknown) => unknown;
            return fn(app, innerArg);
        },
        {fnBody: fn.toString(), arg}
    ) as T;
};

/**
 * Like `evalApp`, but for an async function; resolves with its result.
 */
export const evalAppAsync = async <T, A>(page: Page, fn: (app: any, arg: A) => Promise<T>, arg?: A): Promise<T> => {
    return await page.evaluate(
        async ({fnBody, arg: innerArg}) => {
            // @ts-ignore
            const app = window.histomicsApp;
            // eslint-disable-next-line no-new-func
            const fn = new Function('app', 'arg', `return (${fnBody})(app, arg);`) as (app: unknown, arg: unknown) => Promise<unknown>;
            return await fn(app, innerArg);
        },
        {fnBody: fn.toString(), arg}
    ) as T;
};

/**
 * Wait until a function run inside the page with the app instance returns a
 * truthy value.
 */
export const waitForAppCondition = async <A>(page: Page, fn: (app: any, arg: A) => unknown, arg?: A, message?: string) => {
    await expect.poll(() => evalApp(page, fn, arg), {message}).toBeTruthy();
};

/**
 * Simulate a geojs mouse event on the main image viewer.
 */
export const simulateMapEvent = async (page: Page, event: string, options: Record<string, unknown>) => {
    await evalApp(page, (app, arg) => {
        app.bodyView.viewer.interactor().simulateEvent(arg.event, arg.options);
    }, {event, options});
};
