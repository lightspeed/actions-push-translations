#!/usr/bin/env node

import fs from "fs";
import simplegit from "simple-git/promise";
import flat from "flat";
import util from "util";
import ini from "ini";
import { exec } from "child_process";
import { IncomingWebhook } from "@slack/webhook";

const git = simplegit();
const execAsync = util.promisify(exec);

type Input = {
  slackWebhookUrl: string;
};

type ResourceConfigs = {
  [key: string]: {
    source_file: string;
  };
};

const pushTranslations = async ({ slackWebhookUrl }: Input) => {
  // Extract resources from Transifex config
  const txConfigContents = fs.readFileSync("./.tx/config", "utf8");
  const txConfig = ini.parse(txConfigContents);
  const { main, ...nestedResources } = txConfig;
  const resources: ResourceConfigs = flat(nestedResources, { maxDepth: 2 });
  const resourceNames = Object.keys(resources);

  let pushed = [];
  for (const resourceName of resourceNames) {
    // Extract the project and package name
    const [projectID, resourceID] = resourceName.split(".");
    console.log(
      `Pushing translations for resource ${resourceID} from project ${projectID}`
    );

    // Determine if the source file has been updated
    const sourceFilename = resources[resourceName].source_file;
    const diffSummary = await git.diffSummary(["HEAD~1"]);
    const source = diffSummary.files
      .map(({ file }) => file)
      .find(path => path.includes(sourceFilename));

    // Nothing to do if source file has not been changed
    if (!source) {
      console.log(`Source file unchanged for ${resourceID}`);
      continue;
    }

    // Push translations to Transifex
    const { stdout } = await execAsync(`tx push -s -r ${resourceName}`);
    console.log(`Transifex push output:\n${stdout}`);

    // Track changes in resource files for Slack notification
    const diff = await git.diff(["HEAD~1", "--", sourceFilename]);
    const changes = diff
      .split("\n")
      .filter(line => line.match(/^(\+|\-) /g))
      .join("\n");
    pushed.push({ resourceID, changes });
  }

  // Notify Slack
  if (slackWebhookUrl) {
    const webhook = new IncomingWebhook(slackWebhookUrl);
    await webhook.send({
      attachments: [
        {
          color: "good",
          title: `:rocket: Updated translations pushed to Transifex`,
          fields: pushed.map(({ resourceID, changes }) => ({
            title: resourceID,
            value: `\`\`\`${changes}\`\`\``
          }))
        }
      ]
    });
  }
};

pushTranslations({
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || ""
}).catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
