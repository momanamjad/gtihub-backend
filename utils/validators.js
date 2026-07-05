import Joi from 'joi';

export const registerValidator = Joi.object({
  login: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/(?=.*[A-Z])(?=.*[0-9])/).message('Password must be at least 8 characters long, contain at least one uppercase letter and one number').required(),
}).options({ stripUnknown: true });

export const loginValidator = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
}).options({ stripUnknown: true });

export const changePasswordValidator = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).pattern(/(?=.*[A-Z])(?=.*[0-9])/).message('Password must be at least 8 characters long, contain at least one uppercase letter and one number').required(),
}).options({ stripUnknown: true });

export const updateProfileValidator = Joi.object({
  name: Joi.string().max(50).allow(''),
  bio: Joi.string().max(200).allow(''),
  avatar_url: Joi.string().allow(''),
  company: Joi.string().max(100).allow(''),
  location: Joi.string().max(100).allow(''),
  blog: Joi.string().allow(''),
  pronouns: Joi.string().max(20).allow(''),
  socialLinks: Joi.array().items(Joi.string().allow('')).max(4),
  status: Joi.object({
    emoji: Joi.string().allow(''),
    text: Joi.string().allow(''),
    isBusy: Joi.boolean(),
  }),
}).min(1).options({ stripUnknown: true });

export const createRepoValidator = Joi.object({
  name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9._-]+$/).message('Repository name can only contain letters, numbers, dots, hyphens, and underscores').required(),
  description: Joi.string().max(500).allow(''),
  language: Joi.string().max(50),
  visibility: Joi.string().valid('public', 'private'),
  addReadme: Joi.boolean(),
  fileTree: Joi.array().items(Joi.any()),
  license: Joi.string().max(100).allow(''),
  gitignoreTemplate: Joi.string().max(100).allow(''),
  is_profile_readme: Joi.forbidden(),
}).options({ stripUnknown: true });

export const updateRepoValidator = Joi.object({
  name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9._-]+$/).message('Repository name can only contain letters, numbers, dots, hyphens, and underscores'),
  description: Joi.string().max(500),
  language: Joi.string().max(50),
  visibility: Joi.string().valid('public', 'private'),
  fileTree: Joi.array().items(Joi.any()),
  license: Joi.string().max(100).allow(''),
  is_profile_readme: Joi.forbidden(),
}).min(1).options({ stripUnknown: true });

export const searchValidator = Joi.object({
  q: Joi.string().min(1).max(100).required(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
}).options({ stripUnknown: true });

export const paginationValidator = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  sort: Joi.string().default('-created_at'),
}).options({ stripUnknown: true });
