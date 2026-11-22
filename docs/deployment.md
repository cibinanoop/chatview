# Deployment

## GitHub Pages

1. Create a repository and place the project files directly at its root.
2. Confirm `index.html`, `.nojekyll` and `service-worker.js` are at the root.
3. In repository Settings, open Pages.
4. Set the source to **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Visit the URL supplied by GitHub Pages.

No bundler, package installation, environment file or backend is required. All script, CSS and asset URLs are relative to the project path.

## Local development

Use a local HTTP server so browsers can load JavaScript modules:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. The service worker registers only on HTTPS or localhost.

## Updating the application

Replace the relevant source files and increment `CACHE_NAME` in `service-worker.js` when changing cached resources. This forces clients to install a fresh application shell. The application version shown in the sidebar is maintained in `index.html`.
