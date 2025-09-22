const Client = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');

async function uploadToLinux(localFilePath, remoteDirectory, remoteFileName, sftpConfig) {
  const sftp = new Client();
  const remotePath = path.posix.join(remoteDirectory, remoteFileName);

  try {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File does not exist: ${localFilePath}`);
    }

    await sftp.connect(sftpConfig);

       // Check if remote directory exists; if not, create it recursively
    const dirExists = await sftp.exists(remoteDirectory);
    if (!dirExists) {
      console.log(`📂 Remote directory ${remoteDirectory} does not exist. Creating...`);
      await sftp.mkdir(remoteDirectory, true); // true for recursive
      console.log(`✅ Created remote directory: ${remoteDirectory}`);
    }

     // Check if remote file exists
    const fileExists = await sftp.exists(remotePath);
    if (fileExists) {
      console.log(`⚠️ Remote file already exists: ${remotePath}. Skipping upload.`);
      return;
    }



    await sftp.put(localFilePath, remotePath);
    console.log(`✅ Uploaded ${localFilePath} to ${remotePath}`);

    // Delete the local zip file after upload
    try {
      await fs.promises.unlink(localFilePath);
      console.log(`🗑️ Deleted local zip file: ${localFilePath}`)
      } catch (err) {
      console.error(`❌ Failed to delete local zip file: ${localFilePath}`, err.message)
      };

  } catch (err) {
    console.error('❌ Upload error:', err.message);
  } finally {
    await sftp.end();
  }
}

module.exports = uploadToLinux;
