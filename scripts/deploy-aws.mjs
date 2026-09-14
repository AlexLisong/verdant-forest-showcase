import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'lighthouse' },
    region: { type: 'string', default: 'ca-central-1' },
    stack: { type: 'string', default: 'verdant-forest-showcase' },
  },
});
const root = fileURLToPath(new URL('..', import.meta.url));
const siteDirectory = path.join(root, 'dist/aws');

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, AWS_PAGER: '' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed (${result.status})`);
  return result.stdout?.trim();
}

function aws(args, capture = false) {
  return run('aws', [
    ...args, '--profile', values.profile, '--region', values.region,
  ], capture);
}

// Build from source on every deployment; never upload stale output or server code.
run(process.execPath, [path.join(root, 'node_modules/vinext/dist/cli.js'), 'build']);
run(process.execPath, [path.join(root, 'scripts/prepare-aws.mjs')]);

aws(['cloudformation', 'validate-template', '--template-body', 'file://infra/aws.yaml'], true);
console.log(`Deploying ${values.stack} with AWS profile ${values.profile} in ${values.region}…`);
aws([
  'cloudformation', 'deploy', '--stack-name', values.stack,
  '--template-file', 'infra/aws.yaml', '--no-fail-on-empty-changeset',
  '--tags', 'Project=verdant-forest-showcase', 'ManagedBy=CloudFormation',
]);
const stacks = JSON.parse(aws([
  'cloudformation', 'describe-stacks', '--stack-name', values.stack, '--output', 'json',
], true));
const output = Object.fromEntries(stacks.Stacks[0].Outputs.map(item => [item.OutputKey, item.OutputValue]));
if (!output.BucketName || !output.DistributionId || !output.SiteUrl) {
  throw new Error('CloudFormation did not return all required outputs.');
}
const destination = `s3://${output.BucketName}`;

// Upload dependencies before entry documents. Keep old hashed assets so an open
// tab using an earlier HTML version can still finish loading its modules.
aws([
  's3', 'cp', `${siteDirectory}/`, `${destination}/`, '--recursive',
  '--exclude', '*.html', '--exclude', 'assets/*',
  '--cache-control', 'public,max-age=3600', '--only-show-errors',
]);
aws([
  's3', 'cp', `${siteDirectory}/assets/`, `${destination}/assets/`, '--recursive',
  '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors',
]);
aws([
  's3', 'cp', `${siteDirectory}/`, `${destination}/`, '--recursive',
  '--exclude', '*', '--include', '*.html',
  '--cache-control', 'no-cache,max-age=0,must-revalidate', '--only-show-errors',
]);
const invalidation = JSON.parse(aws([
  'cloudfront', 'create-invalidation', '--distribution-id', output.DistributionId,
  '--paths', '/*', '--output', 'json',
], true));
aws([
  'cloudfront', 'wait', 'invalidation-completed', '--distribution-id', output.DistributionId,
  '--id', invalidation.Invalidation.Id,
]);
console.log(`\nDeployed: ${output.SiteUrl}\nBucket: ${output.BucketName}\nDistribution: ${output.DistributionId}`);
