var Dict = require('./dict').Dict;

var stream_data = (function () {

var exports = {};


// The stream_info variable maps stream names to stream properties objects
// Call clear_subscriptions() to initialize it.
var stream_info;
var subs_by_stream_id;
var filter_out_inactives = false;

var stream_ids_by_name = new Dict({fold_case: true});

exports.clear_subscriptions = function () {
    stream_info = new Dict({fold_case: true});
    subs_by_stream_id = new Dict();
};

exports.clear_subscriptions();

exports.set_filter_out_inactives = function () {
    if (page_params.demote_inactive_streams ===
            settings_display.demote_inactive_streams_values.automatic.code) {
        filter_out_inactives = exports.subscribed_subs().length >= 30;
    } else if (page_params.demote_inactive_streams ===
            settings_display.demote_inactive_streams_values.always.code) {
        filter_out_inactives = true;
    } else {
        filter_out_inactives = false;
    }
};

// for testing:
exports.is_filtering_inactives = function () {
    return filter_out_inactives;
};

exports.is_active = function (sub) {
    exports.set_filter_out_inactives();
    if (!filter_out_inactives || sub.pin_to_top) {
        // If users don't want to filter inactive streams
        // to the bottom, we respect that setting and don't
        // treat any streams as dormant.
        //
        // Currently this setting is automatically determined
        // by the number of streams.  See the callers
        // to set_filter_out_inactives.
        return true;
    }
    return topic_data.stream_has_topics(sub.stream_id) || sub.newly_subscribed;
};

exports.rename_sub = function (sub, new_name) {
    var old_name = sub.name;

    stream_ids_by_name.set(old_name, sub.stream_id);

    sub.name = new_name;
    stream_info.del(old_name);
    stream_info.set(new_name, sub);
};

exports.subscribe_myself = function (sub) {
    var user_id = people.my_current_user_id();
    exports.add_subscriber(sub.name, user_id);
    sub.subscribed = true;
    sub.newly_subscribed = true;
};

exports.unsubscribe_myself = function (sub) {
    // Remove user from subscriber's list
    var user_id = people.my_current_user_id();
    exports.remove_subscriber(sub.name, user_id);
    sub.subscribed = false;
    sub.newly_subscribed = false;
};

exports.add_sub = function (stream_name, sub) {
    if (!_.has(sub, 'subscribers')) {
        sub.subscribers = Dict.from_array([]);
    }

    stream_info.set(stream_name, sub);
    subs_by_stream_id.set(sub.stream_id, sub);
};

exports.get_sub = function (stream_name) {
    return stream_info.get(stream_name);
};

exports.get_sub_by_id = function (stream_id) {
    return subs_by_stream_id.get(stream_id);
};

exports.get_stream_id = function (name) {
    // Note: Only use this function for situations where
    // you are comfortable with a user dealing with an
    // old name of a stream (from prior to a rename).
    var sub = stream_info.get(name);

    if (sub) {
        return sub.stream_id;
    }

    var stream_id = stream_ids_by_name.get(name);
    return stream_id;
};

exports.get_sub_by_name = function (name) {
    // Note: Only use this function for situations where
    // you are comfortable with a user dealing with an
    // old name of a stream (from prior to a rename).

    var sub = stream_info.get(name);

    if (sub) {
        return sub;
    }

    var stream_id = stream_ids_by_name.get(name);

    if (!stream_id) {
        return;
    }

    return subs_by_stream_id.get(stream_id);
};

exports.id_to_slug = function (stream_id) {
    var name = exports.maybe_get_stream_name(stream_id) || 'unknown';

    // The name part of the URL doesn't really matter, so we try to
    // make it pretty.
    name = name.replace(' ', '-');

    return stream_id + '-' + name;
};

exports.name_to_slug = function (name) {
    var stream_id = exports.get_stream_id(name);

    if (!stream_id) {
        return name;
    }

    // The name part of the URL doesn't really matter, so we try to
    // make it pretty.
    name = name.replace(' ', '-');

    return stream_id + '-' + name;
};

exports.slug_to_name = function (slug) {
    var m = /^([\d]+)-/.exec(slug);
    if (m) {
        var stream_id = m[1];
        var sub = subs_by_stream_id.get(stream_id);
        if (sub) {
            return sub.name;
        }
        // if nothing was found above, we try to match on the stream
        // name in the somewhat unlikely event they had a historical
        // link to a stream like 4-horsemen
    }

    return slug;
};


exports.delete_sub = function (stream_id) {
    var sub = subs_by_stream_id.get(stream_id);
    if (!sub) {
        blueslip.warn('Failed to delete stream ' + stream_id);
        return;
    }
    subs_by_stream_id.del(stream_id);
    stream_info.del(sub.name);
};

exports.get_non_default_stream_names = function () {
    var subs = stream_info.values();
    subs = _.reject(subs, function (sub) {
        return exports.is_default_stream_id(sub.stream_id) || !sub.subscribed && sub.invite_only;
    });
    var names = _.pluck(subs, 'name');
    return names;
};

exports.get_unsorted_subs = function () {
    return stream_info.values();
};

exports.get_updated_unsorted_subs = function () {
    // This function is expensive in terms of calculating
    // some values (particularly stream counts) but avoids
    // prematurely sorting subs.
    var all_subs = stream_info.values();

    // Add in admin options and stream counts.
    _.each(all_subs, function (sub) {
        exports.update_calculated_fields(sub);
    });

    // We don't display unsubscribed streams to guest users.
    if (page_params.is_guest) {
        all_subs = _.reject(all_subs, function (sub) {
            return !sub.subscribed;
        });
    }

    return all_subs;
};

exports.subscribed_subs = function () {
    return _.where(stream_info.values(), {subscribed: true});
};

exports.unsubscribed_subs = function () {
    return _.where(stream_info.values(), {subscribed: false});
};

exports.subscribed_streams = function () {
    return _.pluck(exports.subscribed_subs(), 'name');
};

exports.get_invite_stream_data = function () {
    var filter_stream_data = function (sub) {
        return {
            name: sub.name,
            stream_id: sub.stream_id,
            invite_only: sub.invite_only,
            default_stream: stream_data.get_default_status(sub.name),
        };
    };
    var invite_stream_data = _.map(stream_data.subscribed_subs(), filter_stream_data);
    var default_stream_data = _.map(page_params.realm_default_streams, filter_stream_data);

    // Since, union doesn't work on array of objects we are using filter
    var is_included = {};
    var streams = _.filter(default_stream_data.concat(invite_stream_data), function (sub) {
        if (is_included[sub.name]) {
            return false;
        }
        is_included[sub.name] = true;
        return true;
    });
    return streams;
};

exports.invite_streams = function () {
    var invite_list = exports.subscribed_streams();
    var default_list = _.pluck(page_params.realm_default_streams, 'name');
    return _.union(invite_list, default_list);
};

exports.get_colors = function () {
    return _.pluck(exports.subscribed_subs(), 'color');
};

exports.update_subscribers_count = function (sub) {
    var count = sub.subscribers.num_items();
    sub.subscriber_count = count;
};

exports.update_stream_email_address = function (sub, email) {
    sub.email_address = email;
};

exports.get_subscriber_count = function (stream_name) {
    var sub = exports.get_sub_by_name(stream_name);
    if (sub === undefined) {
        blueslip.warn('We got a get_subscriber_count count call for a non-existent stream.');
        return;
    }
    if (!sub.subscribers) {
        return 0;
    }
    return sub.subscribers.num_items();
};

exports.update_stream_announcement_only = function (sub, is_announcement_only) {
    sub.is_announcement_only = is_announcement_only;
};

exports.update_stream_privacy = function (sub, values) {
    sub.invite_only = values.invite_only;
    sub.history_public_to_subscribers = values.history_public_to_subscribers;
};

exports.update_calculated_fields = function (sub) {
    sub.is_admin = page_params.is_admin;
    // Admin can change any stream's name & description either stream is public or
    // private, subscribed or unsubscribed.
    sub.can_change_name_description = page_params.is_admin;
    // If stream is public then any user can subscribe. If stream is private then only
    // subscribed users can unsubscribe.
    // Guest users can't subscribe themselves to any stream.
    sub.should_display_subscription_button = sub.subscribed ||
        !page_params.is_guest && !sub.invite_only;
    sub.should_display_preview_button = sub.subscribed || !sub.invite_only ||
                                        sub.previously_subscribed;
    sub.can_change_stream_permissions = page_params.is_admin && (
        !sub.invite_only || sub.subscribed);
    // User can add other users to stream if stream is public or user is subscribed to stream.
    // Guest users can't access subscribers of any(public or private) non-subscribed streams.
    sub.can_access_subscribers = page_params.is_admin || sub.subscribed || !page_params.is_guest &&
                                 !sub.invite_only;
    sub.preview_url = hash_util.by_stream_uri(sub.stream_id);
    sub.can_add_subscribers = !page_params.is_guest && (!sub.invite_only || sub.subscribed);
    if (sub.rendered_description !== undefined) {
        sub.rendered_description = sub.rendered_description.replace('<p>', '').replace('</p>', '');
    }
    exports.update_subscribers_count(sub);

    // Apply the defaults for our notification settings for rendering.
    if (sub.email_notifications === null) {
        sub.email_notifications_display = page_params.enable_stream_email_notifications;
    } else {
        sub.email_notifications_display = sub.email_notifications;
    }
    if (sub.push_notifications === null) {
        sub.push_notifications_display = page_params.enable_stream_push_notifications;
    } else {
        sub.push_notifications_display = sub.push_notifications;
    }
    if (sub.desktop_notifications === null) {
        sub.desktop_notifications_display = page_params.enable_stream_desktop_notifications;
    } else {
        sub.desktop_notifications_display = sub.desktop_notifications;
    }
    if (sub.audible_notifications === null) {
        sub.audible_notifications_display = page_params.enable_stream_sounds;
    } else {
        sub.audible_notifications_display = sub.audible_notifications;
    }
};

exports.all_subscribed_streams_are_in_home_view = function () {
    return _.every(exports.subscribed_subs(), function (sub) {
        return !sub.is_muted;
    });
};

exports.home_view_stream_names = function () {
    var home_view_subs = _.filter(exports.subscribed_subs(), function (sub) {
        return !sub.is_muted;
    });
    return _.map(home_view_subs, function (sub) {
        return sub.name;
    });
};

exports.canonicalized_name = function (stream_name) {
    return stream_name.toString().toLowerCase();
};

exports.get_color = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return stream_color.default_color;
    }
    return sub.color;
};

exports.is_muted = function (stream_id) {
    var sub = exports.get_sub_by_id(stream_id);
    // Return true for undefined streams
    if (sub === undefined) {
        return true;
    }
    return sub.is_muted;
};

exports.is_stream_muted_by_name = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    // Return true for undefined streams
    if (sub === undefined) {
        return true;
    }
    return sub.is_muted;
};

exports.is_notifications_stream_muted = function () {
    // TODO: add page_params.notifications_stream_id
    return exports.is_stream_muted_by_name(page_params.notifications_stream);
};

exports.is_subscribed = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    return sub !== undefined && sub.subscribed;
};

exports.id_is_subscribed = function (stream_id) {
    var sub = subs_by_stream_id.get(stream_id);
    return sub !== undefined && sub.subscribed;
};

exports.get_invite_only = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return false;
    }
    return sub.invite_only;
};

exports.get_announcement_only = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return false;
    }
    return sub.is_announcement_only;
};

exports.all_topics_in_cache = function (sub) {
    // Checks whether this browser's cache of contiguous messages
    // (used to locally render narrows) in message_list.all has all
    // messages from a given stream, and thus all historical topics
    // for it.  Because message_list.all is a range, we just need to
    // compare it to the range of history on the stream.

    // If the cache isn't initialized, it's a clear false.
    if (message_list.all === undefined || message_list.all.empty()) {
        return false;
    }

    // If the cache doesn't have the latest messages, we can't be sure
    // we have all topics.
    if (!message_list.all.fetch_status.has_found_newest()) {
        return false;
    }

    if (sub.first_message_id === null) {
        // If the stream has no message history, we have it all
        // vacuously.  This should be a very rare condition, since
        // stream creation sends a message.
        return true;
    }

    // Now, we can just compare the first cached message to the first
    // message ID in the stream; if it's older, we're good, otherwise,
    // we might be missing the oldest topics in this stream in our
    // cache.
    var first_cached_message = message_list.all.first();
    return first_cached_message.id <= sub.first_message_id;
};

var default_stream_ids = new Dict();

exports.set_realm_default_streams = function (realm_default_streams) {
    page_params.realm_default_streams = realm_default_streams;
    default_stream_ids.clear();

    realm_default_streams.forEach(function (stream) {
        default_stream_ids.set(stream.stream_id, true);
    });
};

exports.get_default_stream_names = function () {
    var streams = _.map(default_stream_ids.keys(), exports.get_sub_by_id);
    var default_stream_names = _.pluck(streams, 'name');
    return default_stream_names;
};

exports.get_default_status = function (stream_name) {
    var stream_id = exports.get_stream_id(stream_name);

    if (!stream_id) {
        return false;
    }

    return default_stream_ids.has(stream_id);
};

exports.is_default_stream_id = function (stream_id) {
    return default_stream_ids.has(stream_id);
};

exports.get_name = function (stream_name) {
    // This returns the actual name of a stream if we are subscribed to
    // it (i.e "Denmark" vs. "denmark"), while falling thru to
    // stream_name if we don't have a subscription.  (Stream names
    // are case-insensitive, but we try to display the actual name
    // when we know it.)
    //
    // This function will also do the right thing if we have
    // an old stream name in memory for a recently renamed stream.
    var sub = exports.get_sub_by_name(stream_name);
    if (sub === undefined) {
        return stream_name;
    }
    return sub.name;
};

exports.maybe_get_stream_name = function (stream_id) {
    if (!stream_id) {
        return;
    }
    var stream = exports.get_sub_by_id(stream_id);

    if (!stream) {
        return;
    }

    return stream.name;
};

exports.set_subscribers = function (sub, user_ids) {
    sub.subscribers = Dict.from_array(user_ids || []);
};

exports.add_subscriber = function (stream_name, user_id) {
    var sub = exports.get_sub(stream_name);
    if (typeof sub === 'undefined') {
        blueslip.warn("We got an add_subscriber call for a non-existent stream.");
        return false;
    }
    var person = people.get_person_from_user_id(user_id);
    if (person === undefined) {
        blueslip.error("We tried to add invalid subscriber: " + user_id);
        return false;
    }
    sub.subscribers.set(user_id, true);

    return true;
};

exports.remove_subscriber = function (stream_name, user_id) {
    var sub = exports.get_sub(stream_name);
    if (typeof sub === 'undefined') {
        blueslip.warn("We got a remove_subscriber call for a non-existent stream " + stream_name);
        return false;
    }
    if (!sub.subscribers.has(user_id)) {
        blueslip.warn("We tried to remove invalid subscriber: " + user_id);
        return false;
    }

    sub.subscribers.del(user_id);

    return true;
};

exports.is_user_subscribed = function (stream_name, user_id) {
    var sub = exports.get_sub(stream_name);
    if (typeof sub === 'undefined' || !sub.can_access_subscribers) {
        // If we don't know about the stream, or we ourselves cannot access subscriber list,
        // so we return undefined (treated as falsy if not explicitly handled).
        blueslip.warn("We got a is_user_subscribed call for a non-existent or inaccessible stream.");
        return;
    }
    if (typeof user_id === "undefined") {
        blueslip.warn("Undefined user_id passed to function is_user_subscribed");
        return;
    }

    return sub.subscribers.has(user_id);
};

exports.create_streams = function (streams) {
    _.each(streams, function (stream) {
        // We handle subscriber stuff in other events.
        var attrs = _.defaults(stream, {
            subscribers: [],
            subscribed: false,
        });
        exports.create_sub_from_server_data(stream.name, attrs);
    });
};

exports.create_sub_from_server_data = function (stream_name, attrs) {
    var sub = exports.get_sub(stream_name);
    if (sub !== undefined) {
        // We've already created this subscription, no need to continue.
        return sub;
    }

    if (!attrs.stream_id) {
        // fail fast (blueslip.fatal will throw an error on our behalf)
        blueslip.fatal("We cannot create a sub without a stream_id");
        return; // this line is never actually reached
    }

    // Our internal data structure for subscriptions is mostly plain dictionaries,
    // so we just reuse the attrs that are passed in to us, but we encapsulate how
    // we handle subscribers.  We defensively remove the `subscribers` field from
    // the original `attrs` object, which will get thrown away.  (We used to make
    // a copy of the object with `_.omit(attrs, 'subscribers')`, but `_.omit` is
    // slow enough to show up in timings when you have 1000s of streams.

    var subscriber_user_ids = attrs.subscribers;

    delete attrs.subscribers;

    sub = _.defaults(attrs, {
        name: stream_name,
        render_subscribers: !page_params.realm_is_zephyr_mirror_realm || attrs.invite_only === true,
        subscribed: true,
        newly_subscribed: false,
        is_muted: false,
        invite_only: false,
        desktop_notifications: page_params.enable_stream_desktop_notifications,
        audible_notifications: page_params.enable_stream_sounds,
        push_notifications: page_params.enable_stream_push_notifications,
        email_notifications: page_params.enable_stream_email_notifications,
        description: '',
        rendered_description: '',
        first_message_id: attrs.first_message_id,
    });

    exports.set_subscribers(sub, subscriber_user_ids);

    if (!sub.color) {
        sub.color = color_data.pick_color();
    }

    exports.update_calculated_fields(sub);

    exports.add_sub(stream_name, sub);

    return sub;
};

exports.receives_desktop_notifications = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return false;
    }
    if (sub.desktop_notifications !== null) {
        return sub.desktop_notifications;
    }
    return page_params.enable_stream_desktop_notifications;
};

exports.receives_push_notifications = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return false;
    }
    if (sub.push_notifications !== null) {
        return sub.push_notifications;
    }
    return page_params.enable_stream_push_notifications;
};

exports.receives_audible_notifications = function (stream_name) {
    var sub = exports.get_sub(stream_name);
    if (sub === undefined) {
        return false;
    }
    if (sub.audible_notifications !== null) {
        return sub.audible_notifications;
    }
    return page_params.enable_stream_sounds;
};

exports.get_streams_for_settings_page = function () {
    // TODO: This function is only used for copy-from-stream, so
    //       the current name is slightly misleading now, plus
    //       it's not entirely clear we need unsubscribed streams
    //       for that.  Also we may be revisiting that UI.

    // Build up our list of subscribed streams from the data we already have.
    var subscribed_rows = exports.subscribed_subs();
    var unsubscribed_rows = exports.unsubscribed_subs();

    // Sort and combine all our streams.
    function by_name(a, b) {
        return util.strcmp(a.name, b.name);
    }
    subscribed_rows.sort(by_name);
    unsubscribed_rows.sort(by_name);
    var all_subs = unsubscribed_rows.concat(subscribed_rows);

    // Add in admin options and stream counts.
    _.each(all_subs, function (sub) {
        exports.update_calculated_fields(sub);
    });

    return all_subs;
};

exports.sort_for_stream_settings = function (stream_ids) {
    // TODO: We may want to simply use util.strcmp here,
    //       which uses Intl.Collator() when possible.

    function name(stream_id) {
        var sub = stream_data.get_sub_by_id(stream_id);
        if (!sub) {
            return '';
        }
        return sub.name.toLocaleLowerCase();
    }

    function by_stream_name(id_a, id_b) {
        var stream_a_name = name(id_a);
        var stream_b_name = name(id_b);
        return String.prototype.localeCompare.call(stream_a_name, stream_b_name);
    }

    stream_ids.sort(by_stream_name);
};

exports.get_streams_for_admin = function () {
    // Sort and combine all our streams.
    function by_name(a, b) {
        return util.strcmp(a.name, b.name);
    }

    var subs = stream_info.values();

    subs.sort(by_name);

    return subs;
};

exports.initialize = function () {
    color_data.claim_colors(page_params.subscriptions);

    function populate_subscriptions(subs, subscribed, previously_subscribed) {
        subs.forEach(function (sub) {
            var stream_name = sub.name;
            sub.subscribed = subscribed;
            sub.previously_subscribed = previously_subscribed;

            exports.create_sub_from_server_data(stream_name, sub);
        });
    }

    exports.set_realm_default_streams(page_params.realm_default_streams);

    populate_subscriptions(page_params.subscriptions, true, true);
    populate_subscriptions(page_params.unsubscribed, false, true);
    populate_subscriptions(page_params.never_subscribed, false, false);

    // Migrate the notifications stream from the new API structure to
    // what the frontend expects.
    if (page_params.realm_notifications_stream_id !== -1) {
        var notifications_stream_obj =
            exports.get_sub_by_id(page_params.realm_notifications_stream_id);
        if (notifications_stream_obj) {
            // This happens when the notifications stream is a private
            // stream the current user is not subscribed to.
            page_params.notifications_stream = notifications_stream_obj.name;
        } else {
            page_params.notifications_stream = "";
        }
    } else {
        page_params.notifications_stream = "";
    }

    exports.set_filter_out_inactives();

    // Garbage collect data structures that were only used for initialization.
    delete page_params.subscriptions;
    delete page_params.unsubscribed;
    delete page_params.never_subscribed;
};

exports.remove_default_stream = function (stream_id) {
    page_params.realm_default_streams = _.reject(
        page_params.realm_default_streams,
        function (stream) {
            return stream.stream_id === stream_id;
        }
    );
    default_stream_ids.del(stream_id);
};

return exports;

}());
if (typeof module !== 'undefined') {
    module.exports = stream_data;
}
window.stream_data = stream_data;