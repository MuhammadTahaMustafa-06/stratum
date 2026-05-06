import { toast } from "sonner";
import { parseApiError } from "../utils/apiError";

export function notifySuccess(message, options = {}) {
  return toast.success(message, options);
}

export function notifyError(message, options = {}) {
  return toast.error(message, options);
}

export function notifyWarning(message, options = {}) {
  return toast.warning(message, options);
}

export function notifyInfo(message, options = {}) {
  return toast(message, { ...options });
}

/** Map axios/FastAPI errors to a toast (prefers structured API messages). */
export function notifyApiError(err, fallback = "Something went wrong.") {
  const msg = parseApiError(err);
  return toast.error(msg || fallback);
}

export function notifyPromise(promise, messages) {
  return toast.promise(promise, messages);
}
