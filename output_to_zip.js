const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const outputsDir = path.join(__dirname, "outputs");
const zipFile = path.join(__dirname, "output.zip");

if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  console.log("Zipping outputs directory...");
  // Use zip command to zip all files in the outputs directory
  execSync(`zip -r "${zipFile}" .`, { 
    cwd: outputsDir, 
    stdio: "inherit" 
  });
  console.log(`Successfully created ${zipFile}`);
} catch (error) {
  console.error("Error creating zip file:", error.message);
  process.exit(1);
}
