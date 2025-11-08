import { supabase } from "../supabaseClient";

export async function notifyUser({ recipientId, actorId, type, payload = {}, postId = null, commentId = null }) {
    if (!recipientId || !actorId) return;
    if (recipientId === actorId) return;

    try {
        await supabase
            .from("notifications")
            .insert({
                recipient_id: recipientId,
                actor_id: actorId,
                type,
                payload,
                post_id: postId,
                comment_id: commentId,
            });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}

