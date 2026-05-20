export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const err = new Error();
      err.details = error.details;
      return next(err);
    }
    
    req.validated = value;
    next();
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });
    
    if (error) {
      const err = new Error();
      err.details = error.details;
      return next(err);
    }
    
    req.query = value;
    next();
  };
};
