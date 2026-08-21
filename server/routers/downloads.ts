import { getDownloadsForUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const downloadsRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return getDownloadsForUser(ctx.user.id);
  }),
});
