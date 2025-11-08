import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const LIMIT = 30;

export function useNotifications(userId) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState(null);

    const sortedNotifications = useMemo(
        () =>
            [...notifications].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        [notifications]
    );

    const fetchNotifications = useCallback(
        async () => {
            if (!userId) return;
            setLoading(true);
            setError(null);

            try {
                const { data, error: fetchError } = await supabase
                    .from("notifications")
                    .select("*")
                    .eq("recipient_id", userId)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT);

                if (fetchError) {
                    throw fetchError;
                }

                setNotifications(data || []);
                setUnreadCount((data || []).filter((item) => !item.read_at).length);
            } catch (err) {
                console.error("Error fetching notifications:", err);
                setError(err);
            } finally {
                setLoading(false);
            }
        },
        [userId]
    );

    const markAsRead = useCallback(
        async (ids) => {
            if (!userId || !ids || ids.length === 0) return;
            try {
                const now = new Date().toISOString();
                const { error: updateError } = await supabase
                    .from("notifications")
                    .update({ read_at: now })
                    .in("id", ids);

                if (updateError) {
                    throw updateError;
                }

                setNotifications((prev) =>
                    prev.map((notif) =>
                        ids.includes(notif.id) ? { ...notif, read_at: notif.read_at || now } : notif
                    )
                );

                setUnreadCount((prev) => Math.max(prev - ids.length, 0));
            } catch (err) {
                console.error("Error marking notifications read:", err);
            }
        },
        [userId]
    );

    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            setUnreadCount(0);
            return undefined;
        }

        fetchNotifications();

        const channel = supabase.channel(`notifications-${userId}`);

        channel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "notifications",
                filter: `recipient_id=eq.${userId}`,
            },
            (payload) => {
                if (payload.eventType === "INSERT") {
                    const newNotif = payload.new;
                    setNotifications((prev) => {
                        const combined = [newNotif, ...prev];
                        if (combined.length > LIMIT) {
                            return combined.slice(0, LIMIT);
                        }
                        return combined;
                    });
                    setUnreadCount((prev) => prev + 1);
                } else if (payload.eventType === "UPDATE") {
                    let delta = 0;
                    setNotifications((prev) =>
                        prev.map((notif) => {
                            if (notif.id === payload.new.id) {
                                const wasUnread = !notif.read_at;
                                const isUnread = !payload.new.read_at;
                                if (wasUnread !== isUnread) {
                                    delta += isUnread ? 1 : -1;
                                }
                                return payload.new;
                            }
                            return notif;
                        })
                    );
                    if (delta !== 0) {
                        setUnreadCount((prev) => Math.max(prev + delta, 0));
                    }
                } else if (payload.eventType === "DELETE") {
                    setNotifications((prev) => prev.filter((notif) => notif.id !== payload.old.id));
                    if (!payload.old.read_at) {
                        setUnreadCount((prev) => Math.max(prev - 1, 0));
                    }
                }
            }
        );

        channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
                fetchNotifications();
            }
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, fetchNotifications]);

    return {
        notifications: sortedNotifications,
        loading,
        unreadCount,
        error,
        markAsRead,
        refresh: fetchNotifications,
    };
}

