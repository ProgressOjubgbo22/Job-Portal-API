const getPaginationOptions = (query, defaultSort = { createdAt: -1 }) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);

  let sort = defaultSort;
  if (query.sort) {
    // e.g. "newest" | "oldest" | "salary_high" | "salary_low" | "-createdAt" | "field:asc"
    switch (query.sort) {
      case "newest":
        sort = { createdAt: -1 };
        break;
      case "oldest":
        sort = { createdAt: 1 };
        break;
      case "salary_high":
        sort = { salaryMax: -1 };
        break;
      case "salary_low":
        sort = { salaryMin: 1 };
        break;
      default:
        if (query.sort.startsWith("-")) {
          sort = { [query.sort.slice(1)]: -1 };
        } else {
          sort = { [query.sort]: 1 };
        }
    }
  }

  return { page, limit, sort };
};

module.exports = { getPaginationOptions };
