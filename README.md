# ThermoCubic 🌡️

Thank you for taking the time to review our project. This page explains
how to run our Python code in VS Code and open the ThermoCubic
interface in your browser.

Online version (nothing to install): https://jiya-ray.github.io/ThermoCubic/

## How to run the Python code in VS Code 💻

1. Click **Code > Download ZIP** on this page and extract it. You get a
   folder called `ThermoCubic-main`.
2. In VS Code, go to **File > Open Folder** and open that folder.
   `app.py` should be visible directly inside it, together with `eos.py`
   and the `web` folder.
3. Go to **Terminal > New Terminal**. It opens inside the folder.
4. Run this command:

   ```
   python app.py
   ```

5. The app opens automatically in your browser at
   http://127.0.0.1:8000. If the browser does not open on its own, type
   http://127.0.0.1:8000 into the address bar yourself.
6. Keep the terminal open while you use the app. Press Ctrl+C in the
   terminal to stop it.

Requirements: Python 3.6 or newer. No extra packages are needed.

## Files 📁

- `app.py` - starts the local server and opens the app
- `eos.py` - the equation-of-state calculations
- `web/` - the interface served by the local Python app
- `docs/` - the static browser version hosted at the online link above
- `report.pdf` - the project report
