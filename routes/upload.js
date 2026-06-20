import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { auth } from "../middleware/auth.js";
import { AppError } from "../utils/errorHandler.js";

const router = express.Router();

// Ensure upload directory exists
const uploadDir = "./public/uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

// File filter (only allow images)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError("Only jpeg, jpg, png, and webp images are allowed!", 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
});

router.post("/", auth, upload.single("avatar"), (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Please upload an avatar image file", 400));
  }

  // Construct absolute static URL for the image
  const serverPort = process.env.PORT || 5000;
  const protocol = req.protocol;
  const host = req.hostname === "localhost" ? `localhost:${serverPort}` : req.headers.host;
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

  res.json({
    success: true,
    message: "Avatar uploaded successfully",
    url: fileUrl,
  });
});

export default router;
