// CRUD for the app entities (HR & compliance records). The Express server
// stores them in the `appEntities` section of src/data/extracted_data.json,
// so extracted_data.json is the single data store for the whole app.
import { get, post, put, del } from "./http";

const entityApi = (name) => ({
  list: (sort) => get(`/entities/${name}${sort ? `?sort=${encodeURIComponent(sort)}` : ""}`),
  create: (data) => post(`/entities/${name}`, data),
  update: (id, data) => put(`/entities/${name}/${id}`, data),
  delete: (id) => del(`/entities/${name}/${id}`),
});

export const Employee = entityApi("Employee");
export const Licence = entityApi("Licence");
export const Recruitment = entityApi("Recruitment");
export const LeaveRequest = entityApi("LeaveRequest");
