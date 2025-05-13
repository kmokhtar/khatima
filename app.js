// app.js
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable for port

// -------------------- Middleware Configuration -------------------- //
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || "a-very-strong-default-secret-if-env-is-not-set", // Use environment variable for session secret
  resave: false,
  saveUninitialized: false
}));

// -------------------- Set Views Directory and Engine -------------------- //
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// -------------------- Connect to SQLite Database -------------------- //
const db = new sqlite3.Database("./khatma.db", (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite DB.");
});

// -------------------- Database Schema Creation -------------------- //
db.serialize(() => {
  // Khatima table (stored as projects)
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    invitation_code TEXT,
    admin_id INTEGER,
    is_complete INTEGER DEFAULT 0
  )`);

  // Juz' table (stored as tasks)
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    number INTEGER,
    claimed_by INTEGER,
    is_done INTEGER DEFAULT 0
  )`);

  // Project participants table
  db.run(`CREATE TABLE IF NOT EXISTS project_participants (
    user_id INTEGER,
    project_id INTEGER,
    UNIQUE(user_id, project_id)
  )`);

  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  )`);
});

// -------------------- Dummy Authentication Middleware -------------------- //
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect("/login");
  }
  next();
}

// -------------------- Routes -------------------- //

// GET / - Redirect to login page
app.get("/", (req, res) => {
  res.redirect("/login");
});

// ----- Registration Routes ----- //
app.get("/register", (req, res) => {
  res.render("register", { message: null });
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render("register", { message: "Username and password are required." });
  }
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, existingUser) => {
    if (err) {
      console.error("Error checking existing user:", err);
      return res.render("register", { message: "Error checking existing user." });
    }
    if (existingUser) {
      return res.render("register", { message: "This username is already taken. Choose another one." });
    }
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res.render("register", { message: "Error hashing password." });
      }
      db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hashedPassword], function(err) {
        if (err) {
          console.error("Error creating the user:", err);
          return res.render("register", { message: "Error creating the user." });
        }
        res.redirect("/login");
      });
    });
  });
});

// ----- Login Routes ----- //
app.get("/login", (req, res) => {
  res.render("login", { message: null }); 
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("Error during login query:", err);
      return res.render("login", { message: "Error during login." });
    }
    if (!user) {
      return res.render("login", { message: "User not found." });
    }
    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (err) {
        console.error("Error comparing passwords:", err);
        return res.render("login", { message: "Error comparing passwords." });
      }
      if (!match) {
        return res.render("login", { message: "Invalid credentials." });
      }
      req.session.userId = user.id;
      const redirectTo = req.session.redirectTo || "/dashboard";
      req.session.redirectTo = null;
      res.redirect(redirectTo);
    });
  });
});

app.get("/logout", requireLogin, (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// ----- Join Khatima Routes ----- //
app.get("/join_project", requireLogin, (req, res) => {
  const invitationCode = req.query.invitation_code || "";
  res.render("join_project", { message: null, invitation_code: invitationCode });
});

app.post("/join_project", requireLogin, (req, res) => {
  const invitationCode = req.body.invitation_code || "";
  const userId = req.session.userId;
  db.get("SELECT * FROM projects WHERE invitation_code = ?", [invitationCode], (err, project) => {
    if (err) {
      console.error("Error looking up invitation code:", err);
      return res.render("join_project", { message: "Error looking up invitation code.", invitation_code: invitationCode });
    }
    if (!project) {
      return res.render("join_project", { message: "Invalid invitation code.", invitation_code: invitationCode });
    }
    db.run("INSERT OR IGNORE INTO project_participants (user_id, project_id) VALUES (?, ?)", [userId, project.id], (err) => {
      if (err) {
        console.error("Error joining Khatima:", err);
        return res.render("join_project", { message: "Error joining Khatima.", invitation_code: invitationCode });
      }
      res.redirect(`/project/${project.id}`);
    });
  });
});

// ----- Dashboard Route ----- //
app.get("/dashboard", requireLogin, (req, res) => {
  const userId = req.session.userId;
  db.get("SELECT username FROM users WHERE id = ?", [userId], (err, currentUser) => {
    if (err || !currentUser) {
      console.error("User not found for dashboard:", err);
      return res.send("User not found.");
    }
    db.all("SELECT * FROM projects WHERE admin_id = ? AND is_complete = 0", [userId], (err, ownedProjects) => {
      if (err) {
        console.error("Error retrieving owned Khatima:", err);
        return res.send("Error retrieving your Khatima.");
      }
      const joinedQuery = `
        SELECT p.* FROM projects p
        JOIN project_participants pp ON p.id = pp.project_id
        WHERE pp.user_id = ? AND p.is_complete = 0 AND p.admin_id != ?
      `;
      db.all(joinedQuery, [userId, userId], (err, joinedProjects) => {
        if (err) {
          console.error("Error retrieving joined Khatima:", err);
          return res.send("Error retrieving Khatima you joined.");
        }
        const finishedQuery = `
          SELECT p.* FROM projects p
          JOIN project_participants pp ON p.id = pp.project_id
          WHERE pp.user_id = ? AND p.is_complete = 1
        `;
        db.all(finishedQuery, [userId], (err, finishedProjects) => {
          if (err) {
            console.error("Error retrieving completed Khatima:", err);
            return res.send("Error retrieving Completed Khatima.");
          }
          res.render("dashboard", { 
            username: currentUser.username,
            ownedProjects, 
            joinedProjects, 
            finishedProjects 
          });
        });
      });
    });
  });
});

// ----- Create Khatima Routes ----- //
app.get("/create_project", requireLogin, (req, res) => {
  res.render("create_project", { message: null });
});

app.post("/create_project", requireLogin, (req, res) => {
  const userId = req.session.userId;
  const name = req.body.name || "Untitled Khatima";
  db.get("SELECT * FROM projects WHERE name = ?", [name], (err, existingKhatima) => {
    if (err) {
      console.error("Error checking for duplicate Khatima name:", err);
      return res.render("create_project", { message: "Error checking for duplicate Khatima name." });
    }
    if (existingKhatima) {
      return res.render("create_project", { message: "Khatima with this name already exists. Please choose another name." });
    }
    const invitation_code = uuidv4().slice(0, 8);
    const insertKhatima = `INSERT INTO projects (name, invitation_code, admin_id) VALUES (?, ?, ?)`;
    db.run(insertKhatima, [name, invitation_code, userId], function(err) {
      if (err) {
        console.error("Error creating Khatima:", err);
        return res.render("create_project", { message: "Error creating Khatima." });
      }
      const projectId = this.lastID;
      let stmt = db.prepare("INSERT INTO tasks (project_id, number) VALUES (?, ?)");
      for (let i = 1; i <= 30; i++) {
        stmt.run(projectId, i);
      }
      stmt.finalize((err) => {
        if (err) console.error("Error finalizing juz\' insertion:", err);
        db.run("INSERT INTO project_participants (user_id, project_id) VALUES (?, ?)", [userId, projectId], (err) => {
          if (err) console.error("Error adding admin to participants:", err);
          res.redirect(`/project/${projectId}`);
        });
      });
    });
  });
});

// ----- Project Detail & Rename Route ----- //
app.get("/project/:projectId", requireLogin, (req, res) => {
  const projectId = req.params.projectId;
  db.get("SELECT * FROM projects WHERE id = ?", [projectId], (err, project) => {
    if (err || !project) {
      console.error("Khatima not found for ID " + projectId + ":", err);
      return res.send("Khatima not found.");
    }
    const query = `
      SELECT tasks.*,
             u.username AS claimed_by_username
      FROM tasks
      LEFT JOIN users u ON tasks.claimed_by = u.id
      WHERE tasks.project_id = ?
      ORDER BY tasks.number
    `;
    db.all(query, [projectId], (err, tasks) => {
      if (err) {
        console.error("Error retrieving juz\' information for project " + projectId + ":", err);
        return res.send("Error retrieving juz\' information.");
      }
      res.render("project_detail", { project, tasks, userId: req.session.userId });
    });
  });
});

app.post("/project/:projectId/rename", requireLogin, (req, res) => {
  const projectId = req.params.projectId;
  const newName = req.body.new_name;
  const userId = req.session.userId;
  db.get("SELECT * FROM projects WHERE id = ?", [projectId], (err, project) => {
    if (err || !project) {
      return res.send("Khatima not found.");
    }
    if (project.admin_id !== userId) {
      return res.send("Not authorized to rename this Khatima.");
    }
    db.run("UPDATE projects SET name = ? WHERE id = ?", [newName, projectId], (err) => {
      if (err) {
        console.error("Error renaming Khatima:", err);
        return res.send("Error renaming Khatima.");
      }
      res.redirect(`/project/${projectId}`);
    });
  });
});

// ----- Task (Juz\') Action Routes ----- //
app.post("/claim_task/:taskId", requireLogin, (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.session.userId;
  db.get("SELECT * FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err || !task) {
      return res.send("Juz\' not found.");
    }
    if (task.claimed_by || task.is_done) {
      return res.send("Juz\' already claimed or finished.");
    }
    db.run("UPDATE tasks SET claimed_by = ? WHERE id = ?", [userId, taskId], function(err) {
      if (err) {
        console.error("Error claiming juz\':", err);
        return res.send("Error claiming juz\'.");
      }
      db.get("SELECT project_id FROM tasks WHERE id = ?", [taskId], (err, row) => {
        if (err || !row) {
            console.error("Error finding project_id for task after claim:", err);
            return res.redirect("/dashboard"); // Fallback redirect
        }
        res.redirect(`/project/${row.project_id}`);
      });
    });
  });
});

app.post("/mark_task_done/:taskId", requireLogin, (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.session.userId;
  db.get("SELECT * FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err || !task) {
      return res.send("Juz\' not found.");
    }
    db.get("SELECT * FROM projects WHERE id = ?", [task.project_id], (err, project) => {
      if (err || !project) {
        return res.send("Khatima not found.");
      }
      if (task.claimed_by != userId && project.admin_id != userId) {
        return res.send("Not authorized to mark this juz\' as done.");
      }
      db.run("UPDATE tasks SET is_done = 1 WHERE id = ?", [taskId], function(err) {
        if (err) {
          console.error("Error marking juz\' as done:", err);
          return res.send("Error marking juz\' as done.");
        }
        db.all("SELECT is_done FROM tasks WHERE project_id = ?", [task.project_id], (err, tasks) => {
          if (err) {
            console.error("Error checking juz\' statuses:", err);
            return res.send("Error checking juz\' statuses.");
          }
          let allDone = tasks.every(t => t.is_done == 1);
          if (allDone && project.is_complete == 0) {
            db.run("UPDATE projects SET is_complete = 1 WHERE id = ?", [project.id], (err) => {
              if (err) console.error("Error marking project complete:", err);
              res.redirect(`/project/${project.id}`);
            });
          } else {
            res.redirect(`/project/${task.project_id}`);
          }
        });
      });
    });
  });
});

app.post("/unclaim_task/:taskId", requireLogin, (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.session.userId;
  db.get("SELECT * FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err || !task) {
      return res.send("Juz\' not found.");
    }
    if (task.claimed_by != userId) {
      return res.send("Not authorized to unclaim this juz\'.");
    }
    db.run("UPDATE tasks SET claimed_by = NULL WHERE id = ?", [taskId], function(err) {
      if (err) {
        console.error("Error unclaiming juz\':", err);
        return res.send("Error unclaiming juz\'.");
      }
      db.get("SELECT project_id FROM tasks WHERE id = ?", [taskId], (err, row) => {
         if (err || !row) {
            console.error("Error finding project_id for task after unclaim:", err);
            return res.redirect("/dashboard"); // Fallback redirect
        }
        res.redirect(`/project/${row.project_id}`);
      });
    });
  });
});

app.post("/admin_override/:taskId", requireLogin, (req, res) => {
  const taskId = req.params.taskId;
  const userId = req.session.userId;
  const action = req.body.action ? req.body.action.trim().toLowerCase() : "";
  console.log("DEBUG: Admin override action received:", action);
  db.get("SELECT * FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err || !task) {
      return res.send("Juz\' not found.");
    }
    db.get("SELECT * FROM projects WHERE id = ?", [task.project_id], (err, project) => {
      if (err || !project) {
        return res.send("Khatima not found.");
      }
      if (project.admin_id != userId) {
        return res.send("Not authorized for admin override.");
      }
      if (action === "unclaim") {
        db.run("UPDATE tasks SET claimed_by = NULL WHERE id = ?", [taskId], (err) => {
          if (err) {
            console.error("Error in admin unclaim:", err);
            return res.send("Error in admin unclaim.");
          }
          res.redirect(`/project/${project.id}`);
        });
      } else if (action === "mark_done") {
        db.run("UPDATE tasks SET is_done = 1 WHERE id = ?", [taskId], (err) => {
          if (err) {
            console.error("Error in admin mark done:", err);
            return res.send("Error in admin mark done.");
          }
          db.all("SELECT is_done FROM tasks WHERE project_id = ?", [project.id], (err, tasks) => {
            if (err) {
              console.error("Error checking task statuses after admin mark done:", err);
              return res.send("Error checking task statuses.");
            }
            let allDone = tasks.every(t => t.is_done == 1);
            if (allDone && project.is_complete == 0) {
              db.run("UPDATE projects SET is_complete = 1 WHERE id = ?", [project.id], (err) => {
                if (err) console.error("Error marking project complete after admin action:", err);
                res.redirect(`/project/${project.id}`);
              });
            } else {
              res.redirect(`/project/${project.id}`);
            }
          });
        });
      } else if (action === "reset") {
        db.run("UPDATE tasks SET claimed_by = NULL, is_done = 0 WHERE id = ?", [taskId], (err) => {
          if (err) {
            console.error("Error in admin reset:", err);
            return res.send("Error in admin reset.");
          }
          // Also ensure project is marked as not complete if it was
          if (project.is_complete == 1) {
            db.run("UPDATE projects SET is_complete = 0 WHERE id = ?", [project.id], (err) => {
              if (err) console.error("Error un-completing project after admin reset:", err);
              res.redirect(`/project/${project.id}`);
            });
          } else {
            res.redirect(`/project/${project.id}`);
          }
        });
      } else {
        res.send("Invalid admin action.");
      }
    });
  });
});

// -------------------- Start Server -------------------- //
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

