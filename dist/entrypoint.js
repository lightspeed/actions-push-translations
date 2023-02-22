#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const promise_1 = __importDefault(require("simple-git/promise"));
const flat_1 = __importDefault(require("flat"));
const util_1 = __importDefault(require("util"));
const ini_1 = __importDefault(require("ini"));
const child_process_1 = require("child_process");
const webhook_1 = require("@slack/webhook");
const core_1 = require("@actions/core");
const git = promise_1.default();
const execAsync = util_1.default.promisify(child_process_1.exec);
const pushTranslations = ({ slackWebhookUrl }) => __awaiter(void 0, void 0, void 0, function* () {
    // Extract resources from Transifex config
    const txConfigContents = fs_1.default.readFileSync("./.tx/config", "utf8");
    const txConfig = ini_1.default.parse(txConfigContents);
    const { main } = txConfig, nestedResources = __rest(txConfig, ["main"]);
    const resources = flat_1.default(nestedResources, { maxDepth: 1 });
    const resourceNames = Object.keys(resources);
    const sinceCommit = core_1.getInput("since_commit", { required: false }) || "HEAD~1";
    let pushed = [];
    for (const resourceName of resourceNames) {
        const regexp = new RegExp("^o:(.+):p:(.+):r:(.+)$", "g");
        // Extract the project and package name
        const match = regexp.exec(resourceName);
        if (match) {
            const [, , projectID, resourceID] = match;
            console.log(`Pushing translations for resource ${resourceID} from project ${projectID}`);
            // Determine if the source file has been updated
            const sourceFilename = resources[resourceName].source_file;
            console.log(`Checking for changes to ${sourceFilename} since ${sinceCommit}`);
            const diffSummary = yield git.diffSummary([sinceCommit]);
            const source = diffSummary.files
                .map(({ file }) => file)
                .find((path) => path.includes(sourceFilename));
            // Nothing to do if source file has not been changed
            if (!source) {
                console.log(`Source file unchanged for ${resourceID} since ${sinceCommit}`);
                continue;
            }
            // Push translations to Transifex
            const { stdout } = yield execAsync(`tx push -s -r ${projectID}.${resourceID}`);
            console.log(`Transifex push output:\n${stdout}`);
            // // Track changes in resource files for Slack notification
            const diff = yield git.diff([sinceCommit, "--", sourceFilename]);
            const changes = diff
                .split("\n")
                .filter((line) => line.match(/^(\+|\-) /g))
                .join("\n");
            pushed.push({ resourceID, changes });
        }
    }
    // Notify Slack
    if (slackWebhookUrl) {
        const webhook = new webhook_1.IncomingWebhook(slackWebhookUrl);
        yield webhook.send({
            attachments: [
                {
                    color: "good",
                    title: `:rocket: Updated translations pushed to Transifex`,
                    fields: pushed.map(({ resourceID, changes }) => ({
                        title: resourceID,
                        value: `\`\`\`${changes}\`\`\``,
                    })),
                },
            ],
        });
    }
});
pushTranslations({
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
}).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});
