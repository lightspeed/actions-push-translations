# Push Translations

Pushes translations on merge to master, and notifies Slack of the changes.

## Configuration

This action expects a [.tx/config file](https://developers.transifex.com/docs/using-the-client#adding-resources-to-configuration) configured for your project

## Input Options

- `since_commit`: By default, this action will check for changes against the last commit (`HEAD~1`). If you'd like to push changes for more than the most recent commit, use the `since_commit` action to specify this.
