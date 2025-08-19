const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-BG-${category.toUpperCase()}] ${message}`, data ?? ''),
    error: (category, message, error = null) => console.error(`[WINGMAN-BG-${category.toUpperCase()}-ERROR] ${message}`, error ?? ''),
};

export { DEBUG };
