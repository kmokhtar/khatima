# Khatma - Deployment Guidance

This document provides general guidance for deploying your Node.js/Express Khatma application to a permanent hosting platform.

## Project Structure Overview

Your project (`K` folder) contains the following key files and directories:

*   `app.js`: The main application file that starts the Express server and defines all the routes (web pages and actions).
*   `package.json`: Lists the project's dependencies (the other software components it needs to run) and scripts.
*   `package-lock.json`: Records the exact versions of dependencies used.
*   `khatma.db`: This is your SQLite database file. **It is very important as it stores all user data, Khatmas, and chapter statuses.**
*   `views/`: This folder contains your EJS template files, which define the HTML structure of your web pages.
*   `node_modules/`: This folder is created when you run `npm install`. It contains all the downloaded dependency code. **You usually don't upload this folder directly to a hosting provider; instead, the provider will run `npm install` based on your `package.json`.**

## General Deployment Steps for Node.js Applications

While specific steps vary between hosting providers, here's a general outline:

1.  **Choose a Hosting Provider:** Select a platform that supports Node.js applications. Popular choices include:
    *   Heroku
    *   Render
    *   DigitalOcean App Platform
    *   AWS Amplify or AWS Elastic Beanstalk
    *   Google Cloud Run
    *   Vercel (can sometimes host Node.js backends)
    *   Netlify (primarily for static sites, but can run serverless Node.js functions)

    Research their Node.js deployment guides and pricing to find one that suits your needs.

2.  **Prepare Your Application for Production:**
    *   **Session Secret:** In `app.js`, the line `secret: 'your-secret-key'` uses a placeholder. For production, you **must** change `'your-secret-key'` to a long, random, and strong secret string. Hosting providers often allow you to set this as an environment variable (e.g., `SESSION_SECRET`) which your `app.js` can then use.
        *   Example in `app.js`: `secret: process.env.SESSION_SECRET || 'a-very-strong-default-secret-if-env-is-not-set',`
    *   **Database (`khatma.db`):**
        *   **Persistence:** This is the most critical part for a live application. Simple file-based SQLite databases like `khatma.db` can be tricky with some hosting platforms, especially those that have ephemeral (temporary) filesystems. If the filesystem is temporary, your database might be wiped when the app restarts or scales.
        *   **Solutions for Database Persistence:**
            *   **Managed Database Service:** The most robust solution is to use a managed database service (like PostgreSQL, MySQL, or a cloud-based SQLite service if offered) provided by your hosting platform or a third party. This would involve modifying `app.js` to connect to this external database instead of the local `khatma.db` file. This is the recommended approach for production applications.
            *   **Persistent Storage Volume:** Some platforms (like Render or DigitalOcean App Platform) offer persistent disk storage that you can attach to your application. You could configure your app to store `khatma.db` on this persistent disk. This is simpler than a managed database but might have limitations on scaling or backups.
            *   **Backup Regularly:** If you stick with the file-based `khatma.db` on a platform that *does* offer some form of persistent file storage for it, ensure you have a strategy for regularly backing up this file.
    *   **Environment Variables:** Besides the session secret, you might have other configurations (like database connection strings if you switch to a managed database) that are best set as environment variables on your hosting platform rather than hardcoding them in `app.js`.
    *   **`PORT`:** Your `app.js` listens on `const PORT = 3000;`. Most hosting providers will set a `PORT` environment variable that your application *must* use. You should modify your `app.js` to use this:
        *   Change `const PORT = 3000;` to `const PORT = process.env.PORT || 3000;`

3.  **Deployment Process (General):**
    *   **Sign up** for your chosen hosting provider.
    *   **Connect your code:** Most providers allow you to connect your Git repository (e.g., from GitHub, GitLab, Bitbucket) or upload your code directly (often as a ZIP file, but Git is preferred for easier updates).
    *   **Configure Build Settings:**
        *   Specify that it's a Node.js application.
        *   The **build command** is usually `npm install` (or `npm ci` for cleaner installs).
        *   The **start command** is `node app.js` (or whatever script you define in `package.json`'s `scripts.start` field, e.g., `npm start`).
    *   **Set Environment Variables:** Configure your `SESSION_SECRET`, `PORT` (if the platform doesn't set it automatically in a way your app picks up), and any database connection details.
    *   **Deploy:** Trigger the deployment. The platform will typically build your application (run `npm install`) and then start it using your start command.
    *   **Domain Name:** Once deployed, the platform will provide you with a public URL (e.g., `your-app-name.herokuapp.com` or `your-app.onrender.com`). You can often configure a custom domain name later.

4.  **Post-Deployment:**
    *   **Test Thoroughly:** Access your live application and test all features.
    *   **Monitor Logs:** Familiarize yourself with how to access application logs on your hosting provider. This is crucial for troubleshooting any issues.

## Example `package.json` `scripts` section for deployment:

It's good practice to have a `start` script in your `package.json`:

```json
{
  // ... other package.json content ...
  "scripts": {
    "start": "node app.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  // ... rest of package.json content ...
}
```

If you have this, your hosting provider's start command can often just be `npm start`.

## Important Considerations for `khatma.db`

As mentioned, how you handle `khatma.db` is vital.

*   **If you upload `khatma.db` directly with your code during the initial deployment:** This will deploy the database *as it is on your local machine at the time of upload*. Any subsequent changes made on the live server will be to the copy on the server.
*   **If the server filesystem is ephemeral:** The `khatma.db` on the server might be lost on restarts. This makes persistent storage or a managed database service essential.
*   **Migrations:** If you ever need to change the structure of your database tables (e.g., add a new column), you'll need to plan how to apply these changes (migrations) to your live database. This is a more advanced topic but important for long-term maintenance.

This guidance should give you a solid starting point. Remember to consult the specific documentation for the hosting provider you choose, as they will have detailed instructions for Node.js applications.

Good luck with deploying Khatma!
