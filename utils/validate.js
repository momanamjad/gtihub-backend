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
    
    // Express 5 request query is a getter-only property. Mutate the object contents instead of reassigning it.
    for (const key of Object.keys(req.query)) {
      delete req.query[key];
    }
    Object.assign(req.query, value);
    
    next();
  };
};
