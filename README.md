## To use this repo you must install GIT LFS

This repository uses **Git Large File Storage (LFS)** to manage the DuckDB database instance (`.db`) and large CSV datasets. Standard Git commands will only download "pointer files" (1KB text files) instead of the actual data.

### 1. Installation
If you haven't installed Git LFS yet, use the following commands based on your OS:

* **macOS:** `brew install git-lfs`
* **Linux:** `sudo apt-get install git-lfs` or `yum install git-lfs`
* **Windows:** Download and run the installer from [git-lfs.github.com](https://git-lfs.github.com/).

### 2. Setup
After installation, initialize Git LFS on your system:
```bash
git lfs install
```

### 3. Accessing the Data
Once LFS is installed and initialized, you can pull the actual DuckDB and CSV files into your local directory:

```bash
# If you have already cloned the repo
git lfs pull

# If you are cloning for the first time
git clone <repository-url>
```

### 4. Verification
To verify that the large files were downloaded correctly and are not just pointers, you can run:
```bash
git lfs ls-files
```
The output should list your `.db` and `.csv` files. If the files in your project directory are only a few hundred bytes, the `git lfs pull` command was not successful.

---

## 📂 Project Structure
- `client/`: Frontend app source and build assets. To start the frontend, change directory to client and use npm start to begin the frontend. Using the frontend requires the backend to be active.
- `server/`: Backend API and prediction endpoints. To start the backend, change directory to server and use node server.js to start the backend. DuckDB only allows for one backend server running at one time, so please follow the warning messages if the backend fails to start to kill existing DuckDB processes.
- `models/`: Trained model artifacts and modeling notebooks.
- `*.duckdb`, `*.csv`, `*.ipynb`: Local datasets and analysis notebooks at repo root.

### Important Components
- `server/server.js`: Main backend entry point.
- `server/routes.js`: Main API route handlers for analytics queries and delay prediction endpoints.
- `server/predictor.py`: Python inference logic used by prediction routes.
- `client/src/pages/`: Primary UI pages (`AirlineStatistics`, `AirportStatistics`, `RouteStatistics`, `DelayPrediction`).
- `catboost_model.bin`: Primary trained model file used for predictions.
