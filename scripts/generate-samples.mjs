import fs from 'node:fs';
import path from 'node:path';
import { SandboxDemoAdapter } from '../src/core/sandbox-demo.js';
import { FileStreamer } from '../src/core/file-streamer.js';
import { CheckpointDB } from '../src/core/checkpoint-db.js';
import { ExportEngine } from '../src/core/export-engine.js';

const rootDir = path.resolve('c:/YDW/AI/Antigravity/chatvault-intercom-exporter');
const samplesDir = path.join(rootDir, 'samples');
fs.mkdirSync(samplesDir, { recursive: true });

async function generateSample(format, csvMode, fileName, maxConversations = 25) {
  const adapter = new SandboxDemoAdapter({
    totalDemoCount: 500,
    simulateRateLimitPause: false,
    sleepFn: async () => {}
  });
  const streamer = new FileStreamer({
    format,
    suggestedName: fileName,
    preferDiskStream: false
  });
  const engine = new ExportEngine({
    adapter,
    streamer,
    checkpointDb: new CheckpointDB(),
    format,
    csvMode,
    maxConversations
  });

  const res = await engine.run({ triggerBrowserDownload: false });
  const filePath = path.join(samplesDir, fileName);
  fs.writeFileSync(filePath, res.getText(), 'utf8');
  console.log(`Generated sample: ${filePath} (${res.exportedCount} conversations, ${res.bytesWritten} bytes)`);
}

await generateSample('csv', 'summary', 'sample-intercom-25-chats-summary.csv', 25);
await generateSample('csv', 'detailed', 'sample-intercom-10-chats-detailed-parts.csv', 10);
await generateSample('jsonl', 'summary', 'sample-intercom-10-chats.jsonl', 10);
await generateSample('md', 'summary', 'sample-intercom-10-chats-obsidian-rag.md', 10);
