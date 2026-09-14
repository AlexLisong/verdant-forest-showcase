# AWS deployment

The forest is a static Vinext export served over HTTPS by CloudFront with a private
S3 origin. Rendering still happens in the visitor's browser. No application server,
database, API key, or model service is needed.

## Deploy or update

Prerequisites: Node 22.13+, installed npm dependencies, AWS CLI v2, and an authenticated
AWS profile with permission to manage this project's CloudFormation, S3, and CloudFront resources.

```bash
npm run deploy:aws -- --profile lighthouse
```

Defaults: region `ca-central-1`, stack `verdant-forest-showcase`. Override with
`--region` and `--stack` when deploying a separate environment. The command:

1. Builds from source using `output: "export"`.
2. Stages `dist/client` into `dist/aws`, excluding framework build metadata.
3. Validates and creates/updates [`infra/aws.yaml`](../infra/aws.yaml).
4. Uploads textures and hashed scripts before publishing HTML.
5. Invalidates CloudFront and waits for the invalidation to complete.
6. Prints the public URL, bucket name, and distribution ID.

Only `dist/aws` is uploaded. Server bundles, `.openai` metadata, development files,
and source maps are excluded. AWS credentials stay in the local AWS configuration.

## Infrastructure and caching

- S3 encryption and public-access blocking are enabled. There is no public bucket website.
- Origin Access Control permits reads only from this CloudFront distribution.
- HTTP redirects to HTTPS. CloudFront applies its managed security headers policy.
- Hashed JavaScript/CSS assets cache for a year; textures cache for an hour; HTML
  revalidates. Every deployment invalidates all CloudFront paths.
- Old hashed assets are retained so an already-open tab can continue loading them.
- CloudFront uses `PriceClass_100`. AWS storage, request, and transfer charges apply.
- CloudFormation retains the S3 bucket if the stack is deleted, preserving deployed files.

## Inspect the deployment

```bash
aws cloudformation describe-stacks \
  --stack-name verdant-forest-showcase \
  --profile lighthouse --region ca-central-1 \
  --query 'Stacks[0].Outputs'
```

To roll back content, check out the desired source revision and rerun the deployment
command. Retain the same infrastructure template unless intentionally changing resources.
