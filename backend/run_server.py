import uvicorn

if __name__ == "__main__":
    # reload=True is a dev-only convenience that restarts the whole server
    # process (dropping every in-flight connection) whenever a watched file
    # changes on disk. In the packaged desktop app this caused frequent,
    # confusing "lost connection to backend" symptoms — keep it off here.
    # host="127.0.0.1": this is a single-user local desktop app, not a network
    # service — binding to 0.0.0.0 would expose the conversion API to every
    # other device on the same LAN/Wi-Fi with no authentication.
    uvicorn.run("src.main:app", host="127.0.0.1", port=8088, reload=False)
