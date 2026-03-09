import type { InboundNormalizedMessage } from '@engine/gateway/types';

import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleInboundData } from '@engine/gateway/inbound';
import { createFixtureSession, createFixtureStream } from '@tests/helpers/email-fixtures';
import { createInboundTestConfig } from '@tests/helpers/gateway-inbound';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;
let fallbackLogsDirPath = '';
let fallbackAttachmentsDirPath = '';
let personaLogsDirPath = '';
let personaAttachmentsDirPath = '';
let capturedMessage: InboundNormalizedMessage | undefined;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-inbound-persona-routing-',
    chdir: false,
  });
  fallbackLogsDirPath = join(workspace.tempRootPath, 'fallback-logs');
  fallbackAttachmentsDirPath = join(workspace.tempRootPath, 'fallback-attachments');
  personaLogsDirPath = join(workspace.tempRootPath, 'persona-logs');
  personaAttachmentsDirPath = join(workspace.tempRootPath, 'persona-attachments');

  await handleInboundData({
    stream: createFixtureStream({ fixtureFileName: 'email-with-attachment.eml' }),
    session: createFixtureSession({
      rcptToAddress: 'pubkeylocalpart@relay-protege-mail.com',
    }),
    config: createInboundTestConfig({
      logsDirPath: fallbackLogsDirPath,
      attachmentsDirPath: fallbackAttachmentsDirPath,
      onMessage: async ({ message }): Promise<void> => {
        capturedMessage = message;
      },
      overrides: {
        resolvePersonaId: (): string | undefined => 'persona-abc',
        resolvePersonaPaths: (): { logsDirPath: string; attachmentsDirPath: string } => ({
          logsDirPath: personaLogsDirPath,
          attachmentsDirPath: personaAttachmentsDirPath,
        }),
      },
    }),
  });
});

afterAll((): void => {
  workspace.cleanup();
});

describe('gateway inbound persona routing', () => {
  it('sets persona id on normalized inbound message when resolved', () => {
    expect(capturedMessage?.personaId).toBe('persona-abc');
  });

  it('persists raw mime into resolved persona logs path', () => {
    expect(capturedMessage?.rawMimePath.startsWith(personaLogsDirPath)).toBe(true);
  });

  it('persists attachments into resolved persona attachments path', () => {
    expect(capturedMessage?.attachments[0]?.storagePath.startsWith(personaAttachmentsDirPath)).toBe(true);
  });
});
