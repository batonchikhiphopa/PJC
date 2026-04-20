// state.js — simple shared state

export const state = {
  user: null,
  companies: [],
  currentPage: 'dashboard',
  detailApplicationId: null,
};

export function setUser(u) { state.user = u; }
export function setCompanies(list) { state.companies = list; }
export function setPage(p) { state.currentPage = p; }
