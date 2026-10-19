
const { spawn } = require("child_process");

const children = [];

function startProcess(name, script) {
    const child = spawn(
        process.execPath,
        [script],
        {
            stdio: "inherit",
            env: process.env
        }
    );

    children.push(child);

    child.on("error", (error) => {
        console.error(`${name} failed to start:`, error.message);
        shutdown(1);
    });

    child.on("exit", (code, signal) => {
        if (!shuttingDown) {
            console.error(
                `${name} exited unexpectedly. Code: ${code}, Signal: ${signal}`
            );
            shutdown(code || 1);
        }
    });

    return child;
}

let shuttingDown = false;

function shutdown(exitCode = 0) {
    if (shuttingDown) return;

    shuttingDown = true;

    for (const child of children) {
        if (child.exitCode === null && !child.killed) {
            child.kill("SIGTERM");
        }
    }

    setTimeout(() => {
        for (const child of children) {
            if (child.exitCode === null && !child.killed) {
                child.kill("SIGKILL");
            }
        }

        process.exit(exitCode);
    }, 5000);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

startProcess("API server", "src/server.js");
startProcess("PDF worker", "src/worker/pdfWorker.js");
