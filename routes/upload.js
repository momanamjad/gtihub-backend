import express from "express";
import multer from "multer";
import path from "path";
import { auth } from "../middleware/auth.js";
import { AppError } from "../utils/errorHandler.js";

const router = express.Router();

// Multer memory storage configuration (allows base64 encoding without relying on local disks)
const storage = multer.memoryStorage();

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

  try {
    // Convert file buffer to base64 data URL
    const base64Data = req.file.buffer.toString("base64");
    const fileUrl = `data:${req.file.mimetype};base64,${base64Data}`;

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      url: fileUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
