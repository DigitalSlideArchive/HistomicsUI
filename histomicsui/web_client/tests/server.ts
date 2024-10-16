import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { expect, test } from '@playwright/test';

const mongoUri = process.env.GIRDER_CLIENT_TESTING_MONGO_URI ?? 'mongodb://mongodb:27017';

const startServer = async (port: number) => {
  const database = `${mongoUri}/girder-${port}`;
  let command, args;

  if (process.env.HISTOMICS_PLAYWRIGHT_DEV) {
    // For recording with playwright, it's run through VSCode and Girder is run via docker-compose
    command = 'docker-compose';
    args = [
        'run',
        '-p', `${port}:${port}`,
        '--rm',
        'histomicsui',
        'girder',
        'serve',
        '--host', '0.0.0.0',
        '--with-temp-assetstore',
        '--port', `${port}`,
        '--database', database,
      ];
  } else {
    // For running tests in CI, this process is run inside of the histomicsui docker container
    command = 'girder';
    args = [
      'serve',
      '--database', database,
      '--port', `${port}`,
      '--with-temp-assetstore',
    ];
  }

  const serverProcess = spawn(command, args, {
    env: {
      ...process.env,
      GIRDER_SETTING_CORE_CORS_ALLOW_ORIGIN: '*',
      GIRDER_EMAIL_TO_CONSOLE: 'true',
    },
    detached: true,
  });
  await new Promise<void>((resolve) => {
    serverProcess?.stdout.on('data', (data: string) => {
      console.log(`stdout: ${data}`);
      if (data.includes('ENGINE Bus STARTED')) {
        resolve();
      }
    });
    serverProcess?.stderr.on('data', (data: string) => {
      console.error(`stderr: ${data}`);
    });
    serverProcess?.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });
  });
  return serverProcess;
};

export const setupServer = () => {
  let serverProcess: ChildProcessWithoutNullStreams;
  const port = Math.floor(Math.random() * 2000 + 6000);

  test.beforeAll(async () => {
    serverProcess = await startServer(port);
  });

  test.afterAll(async () => {
    if (process.env.GIRDER_CLIENT_TESTING_KEEP_SERVER_ALIVE) {
      if (serverProcess) {
        console.log('WARNING: Girder server is being kept alive after test ends. Use the following to kill it:');
        console.log(`kill ${serverProcess?.pid}`);
      }
      return;
    }

    serverProcess?.kill();

    const mongoshProcess = spawn('mongosh', [`${mongoUri}/girder-${port}`, '--eval', 'db.dropDatabase();']);

    await new Promise<void>((resolve) => {
      mongoshProcess?.on('close', (code) => {
        if (code === 0) {
          console.log('mongo database cleaned up');
        } else {
          console.error('mongo database cleanup failed with code', code);
        }

        resolve();
      });

      mongoshProcess?.on('error', (err) => {
        console.error('mongosh process error -- database not cleaned up', err);
        resolve();
      });
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`http://0.0.0.0:${port}/`);
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
  });
};