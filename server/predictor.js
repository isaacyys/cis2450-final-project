const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const VENV_PYTHON = path.join(ROOT_DIR, '.venv', 'bin', 'python');
const PYTHON_BIN = process.env.PYTHON_BIN || (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3');
const SCRIPT = path.join(__dirname, 'predictor.py');

// Long-running CatBoost predictor subprocess. Exposes a single `.predict()`
// method that resolves with {probability, features_used}.
class Predictor {
  constructor() {
    this.child = null;
    this.ready = false;
    this.featureNames = null;
    this.catFeatures = null;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.readyPromise = this._spawn();
  }

  _spawn() {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(PYTHON_BIN, [SCRIPT], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err) {
        reject(err);
        return;
      }
      this.child = child;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      this._resolveReady = resolve;
      this._rejectReady = reject;

      child.stdout.on('data', (chunk) => this._onStdout(chunk));
      child.stderr.on('data', (chunk) => {
        const text = String(chunk).trimEnd();
        if (text) console.error('[predictor]', text);
      });
      child.on('error', (err) => {
        console.error('[predictor] spawn error:', err.message);
        if (!this.ready) reject(err);
      });
      child.on('exit', (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        const err = new Error(`predictor subprocess exited (${reason})`);
        for (const [, p] of this.pending) p.reject(err);
        this.pending.clear();
        this.ready = false;
        if (!this.ready && this._rejectReady) this._rejectReady(err);
      });
    });
  }

  _onStdout(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        console.error('[predictor] unparseable line:', line.slice(0, 200));
        continue;
      }

      if (!this.ready && msg.ready) {
        this.ready = true;
        this.featureNames = msg.feature_names || [];
        this.catFeatures = msg.cat_features || [];
        console.log(
          `[predictor] ready: ${this.featureNames.length} features (cat: ${this.catFeatures.join(', ')})`,
        );
        this._resolveReady();
        continue;
      }

      const pending = this.pending.get(msg.id);
      if (!pending) continue;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg);
    }
  }

  async predict(features) {
    await this.readyPromise;
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('predictor subprocess is not writable');
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.child.stdin.write(JSON.stringify({ id, features }) + '\n');
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  shutdown() {
    try {
      if (this.child && !this.child.killed) this.child.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
  }
}

const predictor = new Predictor();

predictor.readyPromise.catch((err) => {
  console.error('[predictor] failed to initialize:', err.message);
});

// Mirror the duckdb.js shutdown hooks so we never leak a python child.
const shutdown = (signal) => {
  predictor.shutdown();
  if (signal) process.exit(0);
};
process.on('exit', () => shutdown(null));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

module.exports = predictor;
