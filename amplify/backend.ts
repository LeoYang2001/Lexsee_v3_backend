import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { srsReviewNotifier } from "./functions/srs-review-notifier/resource";

defineBackend({
  auth,
  data,
  srsReviewNotifier,
});
