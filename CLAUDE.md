# VMLA Vol — Claude Code Instructions

## Git & Deploy
- **Single branch**: The only branch is `hotfix/rollback-form`. There is no remote `main`. Do NOT create PRs or try to merge into `main`.
- **No auto-deploy**: Vercel is NOT connected to git. Pushes do not trigger deploys.
- **To deploy**: After pushing, always run `vercel --prod` to deploy to production.
- **Deploy URL**: https://vmlavol.vercel.app
