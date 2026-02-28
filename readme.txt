- Technology used
    - This project uses basic html, css, and javascript without any framework.
    - It is being backed up by GitHub repo

- How is it hosted?
    - It is hosted using a free google drive service "drv.tw" from the files stored in the google drive
    - The folder on the drive is mirrored using this projects clone directory, so any changes made in it will be mirrored to the drive automatically
        - There is a sgr_sync file in the root of the folder, running it syncs the files to the clone directory, which then is automatically synced by the drive

- Highlight system
    - It is using google sheet as a database to store highlights using free google script service
    - AppScript responsible is "Highlights.gs"

- Device access system
    - It generates a unique fingerprint for a device, this fingerprint is saved in a google sheet, which can be allowed or restricted
    - Is is also using google sheet as a database to store device fingerprints
    - AppScript responsible is "DeviceAccess.gs"

- Not to do!
    - Do not change file names
        - Files names are used by google sheet to store highlights for that particular page
    - Do not update the text content
        - If that text was highlighted then it will stop functioning