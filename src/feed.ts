import * as Faye from 'faye';
import StreamClient, { APIResponse } from './client';
import StreamUser from './user';
import * as errors from './errors';
import utils from './utils';
import { EnrichedReaction } from './reaction';
import { CollectionResponse } from './collections';

export type EnrichOptions = {
  enrich?: boolean;
  withOwnReactions?: boolean;
  withOwnChildren?: boolean;
  ownReactions?: boolean; // best not to use it, will removed by clinet.replaceReactionOptions()
  withReactionCounts?: boolean;
  withRecentReactions?: boolean;
  recentReactionsLimit?: number;
  reactionKindsFilter?: string; // TODO: add support for array sample: kind,kind,kind
};

type FeedPaginationOptions = {
  id_lt?: string;
  id_lte?: string;
  id_gt?: string;
  id_gte?: string;
  limit?: number;
};

type RankedFeedOptions = {
  offset?: number;
  ranking?: string;
  session?: string;
};

export type GetFeedOptions = FeedPaginationOptions & EnrichOptions & RankedFeedOptions;

type NotificationFeedOptions = {
  mark_read?: boolean | 'current' | string[];
  mark_seen?: boolean | 'current' | string[];
};

type GetFollowOptions = {
  limit?: number;
  offset?: number;
  filter?: string[];
};

type GetFollowAPIResponse = APIResponse & {
  results: { feed_id: string; target_id: string; created_at: Date; updated_at: Date }[];
};

type BaseActivity<ActivityType> = ActivityType & {
  actor: string;
  verb: string;
  object: string | unknown;
  to?: string[];
  target?: string;
};

type NewActivity<ActivityType> = BaseActivity<ActivityType> & { time?: string; foreign_id?: string };

export type UpdateActivity<ActivityType> = BaseActivity<ActivityType> & { time: string; foreign_id: string };

export type Activity<ActivityType> = BaseActivity<ActivityType> & {
  id: string;
  time: Date;
  foreign_id: string;
  origin?: string;
  extra_context?: Record<string, unknown>;

  // ranked feeds
  score?: number;
  analytics?: Record<string, number>;
};

type ReactionsRecords<ReactionType, ChildReactionType, UserType> = Record<
  string,
  EnrichedReaction<ReactionType, ChildReactionType, UserType>[]
>;

type EnrichedActivity<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType> = Activity<
  ActivityType
> & {
  actor: UserType | string;
  object:
    | string
    | unknown
    | EnrichedActivity<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>
    | EnrichedReaction<ReactionType, ChildReactionType, UserType>
    | CollectionResponse<CollectionType>;

  // enriched reactions
  reaction_counts?: Record<string, number>;
  latest_reactions?: ReactionsRecords<ReactionType, ChildReactionType, UserType>;
  own_reactions?: ReactionsRecords<ReactionType, ChildReactionType, UserType>[];
  latest_reactions_extra?: Record<string, { next?: string }>;
  own_reactions_extra?: Record<string, { next?: string }>;
  // Reaction posted to feed
  reaction?: EnrichedReaction<ReactionType, ChildReactionType, UserType>;
};

type FlatActivity<ActivityType> = Activity<ActivityType>;

type FlatActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType> = EnrichedActivity<
  UserType,
  ActivityType,
  CollectionType,
  ReactionType,
  ChildReactionType
>;

type BaseAggregatedActivity = {
  id: string;
  verb: string;
  group: string;
  activity_count: number;
  actor_count: number;
  updated_at: Date;
  created_at: Date;
  score?: number;
};

type AggregatedActivity<ActivityType> = BaseAggregatedActivity & {
  activities: Activity<ActivityType>[];
};

type AggregatedActivityEnriched<
  UserType,
  ActivityType,
  CollectionType,
  ReactionType,
  ChildReactionType
> = BaseAggregatedActivity & {
  activities: EnrichedActivity<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>;
};

type BaseNotificationActivity = { is_read: boolean; is_seen: boolean };
type NotificationActivity<ActivityType> = AggregatedActivity<ActivityType> & BaseNotificationActivity;

type NotificationActivityEnriched<
  UserType,
  ActivityType,
  CollectionType,
  ReactionType,
  ChildReactionType
> = BaseNotificationActivity &
  AggregatedActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>;

type FeedAPIResponse<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType> = APIResponse & {
  next: string;
  results:
    | FlatActivity<ActivityType>[]
    | FlatActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>[]
    | AggregatedActivity<ActivityType>[]
    | AggregatedActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>[]
    | NotificationActivity<ActivityType>[]
    | NotificationActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>[];

  // Notification Feed only
  unread?: number;
  unseen?: number;
};

export type PersonalizationFeedAPIResponse<
  UserType,
  ActivityType,
  CollectionType,
  ReactionType,
  ChildReactionType
> = APIResponse & {
  next: string;
  limit: number;
  offset: number;
  version: string;
  results: FlatActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>[];
};

export type GetActivitiesAPIResponse<
  UserType,
  ActivityType,
  CollectionType,
  ReactionType,
  ChildReactionType
> = APIResponse & {
  results:
    | FlatActivity<ActivityType>[]
    | FlatActivityEnriched<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>[];
};

/**
 * Manage api calls for specific feeds
 * The feed object contains convenience functions such add activity, remove activity etc
 * @class StreamFeed
 */
export default class StreamFeed<
  UserType = unknown,
  ActivityType = unknown,
  CollectionType = unknown,
  ReactionType = unknown,
  ChildReactionType = unknown
> {
  client: StreamClient;
  token: string;
  id: string;
  slug: string;
  userId: string;
  feedUrl: string;
  feedTogether: string;
  signature: string;
  notificationChannel: string;

  constructor(client: StreamClient, feedSlug: string, userId: string, token: string) {
    /**
     * Initialize a feed object
     * @method constructor
     * @memberof StreamFeed.prototype
     * @param {StreamClient} client - The stream client this feed is constructed from
     * @param {string} feedSlug - The feed slug
     * @param {string} userId - The user id
     * @param {string} [token] - The authentication token
     */

    if (!feedSlug || !userId) {
      throw new errors.FeedError('Please provide a feed slug and user id, ie client.feed("user", "1")');
    }

    if (feedSlug.indexOf(':') !== -1) {
      throw new errors.FeedError('Please initialize the feed using client.feed("user", "1") not client.feed("user:1")');
    }

    utils.validateFeedSlug(feedSlug);
    utils.validateUserId(userId);

    // raise an error if there is no token
    if (!token) {
      throw new errors.FeedError('Missing token, in client side mode please provide a feed secret');
    }

    this.client = client;
    this.slug = feedSlug;
    this.userId = userId;
    this.id = `${this.slug}:${this.userId}`;
    this.token = token;

    this.feedUrl = this.id.replace(':', '/');
    this.feedTogether = this.id.replace(':', '');
    this.signature = `${this.feedTogether} ${this.token}`;

    // faye setup
    this.notificationChannel = `site-${this.client.appId}-feed-${this.feedTogether}`;
  }

  addActivity(activity: NewActivity<ActivityType>) {
    /**
     * Adds the given activity to the feed
     * @method addActivity
     * @memberof StreamFeed.prototype
     * @param {object} activity - The activity to add
     * @return {Promise} Promise object
     */

    activity = utils.replaceStreamObjects(activity);
    if (!activity.actor && this.client.currentUser) {
      activity.actor = this.client.currentUser.ref();
    }

    return this.client.post<Activity<ActivityType>>({
      url: `feed/${this.feedUrl}/`,
      body: activity,
      signature: this.signature,
    });
  }

  removeActivity(activityId: string | { foreignId: string }) {
    /**
     * Removes the activity by activityId
     * @method removeActivity
     * @memberof StreamFeed.prototype
     * @param  {string}   activityId Identifier of activity to remove
     * @return {Promise} Promise object
     * @example
     * feed.removeActivity(activityId);
     * @example
     * feed.removeActivity({'foreignId': foreignId});
     */
    return this.client.delete<APIResponse & { removed: string }>({
      url: `feed/${this.feedUrl}/${(activityId as { foreignId: string }).foreignId || activityId}/`,
      qs: (activityId as { foreignId: string }).foreignId ? { foreign_id: '1' } : {},
      signature: this.signature,
    });
  }

  addActivities(activities: NewActivity<ActivityType>[]) {
    /**
     * Adds the given activities to the feed
     * @method addActivities
     * @memberof StreamFeed.prototype
     * @param  {Array}   activities Array of activities to add
     * @return {Promise}               XHR request object
     */
    return this.client.post<Activity<ActivityType>[]>({
      url: `feed/${this.feedUrl}/`,
      body: { activities: utils.replaceStreamObjects(activities) },
      signature: this.signature,
    });
  }

  follow(targetSlug: string, targetUserId: string | { id: string }, options: { limit?: number } = {}) {
    /**
     * Follows the given target feed
     * @method follow
     * @memberof StreamFeed.prototype
     * @param  {string}   targetSlug   Slug of the target feed
     * @param  {string}   targetUserId User identifier of the target feed
     * @param  {object}   options      Additional options
     * @param  {number}   options.limit Limit the amount of activities copied over on follow
     * @return {Promise}  Promise object
     * @example feed.follow('user', '1');
     * @example feed.follow('user', '1');
     * @example feed.follow('user', '1', options);
     */
    if (targetUserId instanceof StreamUser) {
      targetUserId = targetUserId.id;
    }
    utils.validateFeedSlug(targetSlug);
    utils.validateUserId(targetUserId as string);

    const body: { target: string; activity_copy_limit?: number } = { target: `${targetSlug}:${targetUserId}` };
    if (typeof options.limit === 'number') body.activity_copy_limit = options.limit;

    return this.client.post<APIResponse>({
      url: `feed/${this.feedUrl}/following/`,
      body,
      signature: this.signature,
    });
  }

  unfollow(targetSlug: string, targetUserId: string, options: { keepHistory?: boolean } = {}) {
    /**
     * Unfollow the given feed
     * @method unfollow
     * @memberof StreamFeed.prototype
     * @param  {string}   targetSlug   Slug of the target feed
     * @param  {string}   targetUserId [description]
     * @param  {object} options
     * @param  {boolean}  options.keepHistory when provided the activities from target
     *                                                 feed will not be kept in the feed
     * @return {object}                XHR request object
     * @example feed.unfollow('user', '2');
     */
    const qs: { keep_history?: string } = {};
    if (typeof options.keepHistory === 'boolean' && options.keepHistory) qs.keep_history = '1';

    utils.validateFeedSlug(targetSlug);
    utils.validateUserId(targetUserId);
    const targetFeedId = `${targetSlug}:${targetUserId}`;
    return this.client.delete<APIResponse>({
      url: `feed/${this.feedUrl}/following/${targetFeedId}/`,
      qs,
      signature: this.signature,
    });
  }

  following(options: GetFollowOptions = {}) {
    /**
     * List which feeds this feed is following
     * @method following
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @param  {string}   options.filter Filter to apply on search operation
     * @return {Promise} Promise object
     * @example feed.following({limit:10, filter: ['user:1', 'user:2']});
     */
    const extraOptions: { filter?: string } = {};
    if (options.filter) extraOptions.filter = options.filter.join(',');

    return this.client.get<GetFollowAPIResponse>({
      url: `feed/${this.feedUrl}/following/`,
      qs: { ...options, ...extraOptions },
      signature: this.signature,
    });
  }

  followers(options: GetFollowOptions = {}) {
    /**
     * List the followers of this feed
     * @method followers
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @param  {string}   options.filter Filter to apply on search operation
     * @return {Promise} Promise object
     * @example
     * feed.followers({limit:10, filter: ['user:1', 'user:2']});
     */
    const extraOptions: { filter?: string } = {};
    if (options.filter) extraOptions.filter = options.filter.join(',');

    return this.client.get<GetFollowAPIResponse>({
      url: `feed/${this.feedUrl}/followers/`,
      qs: { ...options, ...extraOptions },
      signature: this.signature,
    });
  }

  get(options: GetFeedOptions & NotificationFeedOptions = {}) {
    /**
     * Reads the feed
     * @method get
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @return {Promise} Promise object
     * @example feed.get({limit: 10, id_lte: 'activity-id'})
     * @example feed.get({limit: 10, mark_seen: true})
     */

    const extraOptions: { mark_read?: boolean | string; mark_seen?: boolean | string } = {};

    if (options.mark_read && (options.mark_read as string[]).join) {
      extraOptions.mark_read = (options.mark_read as string[]).join(',');
    }

    if (options.mark_seen && (options.mark_seen as string[]).join) {
      extraOptions.mark_seen = (options.mark_seen as string[]).join(',');
    }

    this.client.replaceReactionOptions(options);

    const path = this.client.shouldUseEnrichEndpoint(options) ? 'enrich/feed/' : 'feed/';

    return this.client.get<FeedAPIResponse<UserType, ActivityType, CollectionType, ReactionType, ChildReactionType>>({
      url: `${path}${this.feedUrl}/`,
      qs: { ...options, ...extraOptions },
      signature: this.signature,
    });
  }

  getActivityDetail(activityId: string, options: EnrichOptions) {
    /**
     * Retrieves one activity from a feed and adds enrichment
     * @method getActivityDetail
     * @memberof StreamFeed.prototype
     * @param  {string}   activityId Identifier of activity to retrieve
     * @param  {object}   options  Additional options
     * @return {Promise} Promise object
     * @example feed.getActivityDetail(activityId)
     * @example feed.getActivityDetail(activityId, {withRecentReactions: true})
     * @example feed.getActivityDetail(activityId, {withReactionCounts: true})
     * @example feed.getActivityDetail(activityId, {withOwnReactions: true, withReactionCounts: true})
     */
    return this.get({
      id_lte: activityId,
      id_gte: activityId,
      limit: 1,
      ...(options || {}),
    });
  }

  getFayeClient() {
    /**
     * Returns the current faye client object
     * @method getFayeClient
     * @memberof StreamFeed.prototype
     * @access private
     * @return {object} Faye client
     */
    return this.client.getFayeClient();
  }

  subscribe(callback: Faye.Callback) {
    /**
     * Subscribes to any changes in the feed, return a promise
     * @method subscribe
     * @memberof StreamFeed.prototype
     * @param  {function} callback Callback to call on completion
     * @return {Promise}           Promise object
     * @example
     * feed.subscribe(callback).then(function(){
     * 		console.log('we are now listening to changes');
     * });
     */
    if (!this.client.appId) {
      throw new errors.SiteError(
        'Missing app id, which is needed to subscribe, use var client = stream.connect(key, secret, appId);',
      );
    }

    const subscription = this.getFayeClient().subscribe(`/${this.notificationChannel}`, callback);
    this.client.subscriptions[`/${this.notificationChannel}`] = {
      token: this.token,
      userId: this.notificationChannel,
      fayeSubscription: subscription,
    };

    return subscription;
  }

  unsubscribe() {
    /**
     * Cancel updates created via feed.subscribe()
     * @return void
     */
    const streamSubscription = this.client.subscriptions[`/${this.notificationChannel}`];
    if (streamSubscription) {
      delete this.client.subscriptions[`/${this.notificationChannel}`];
      streamSubscription.fayeSubscription.cancel();
    }
  }

  updateActivityToTargets(
    foreignId: string,
    time: string,
    newTargets?: string[],
    addedTargets?: string[],
    removedTargets?: string[],
  ) {
    /**
     * Updates an activity's "to" fields
     * @since 3.10.0
     * @param {string} foreignId The foreign_id of the activity to update
     * @param {string} time The time of the activity to update
     * @param {array} newTargets Set the new "to" targets for the activity - will remove old targets
     * @param {array} added_targets Add these new targets to the activity
     * @param {array} removedTargets Remove these targets from the activity
     */

    if (!foreignId) throw new Error('Missing `foreign_id` parameter!');
    if (!time) throw new Error('Missing `time` parameter!');

    if (!newTargets && !addedTargets && !removedTargets) {
      throw new Error(
        'Requires you to provide at least one parameter for `newTargets`, `addedTargets`, or `removedTargets` - example: `updateActivityToTargets("foreignID:1234", new Date(), [newTargets...], [addedTargets...], [removedTargets...])`',
      );
    }

    if (newTargets) {
      if (addedTargets || removedTargets) {
        throw new Error("Can't include add_targets or removedTargets if you're also including newTargets");
      }
    }

    if (addedTargets && removedTargets) {
      // brute force - iterate through added, check to see if removed contains that element
      addedTargets.forEach((addedTarget) => {
        if (removedTargets.includes(addedTarget)) {
          throw new Error("Can't have the same feed ID in addedTargets and removedTargets.");
        }
      });
    }

    const body: {
      foreign_id: string;
      time: string;
      new_targets?: string[];
      added_targets?: string[];
      removed_targets?: string[];
    } = { foreign_id: foreignId, time };
    if (newTargets) body.new_targets = newTargets;
    if (addedTargets) body.added_targets = addedTargets;
    if (removedTargets) body.removed_targets = removedTargets;

    return this.client.post<APIResponse & Activity<ActivityType> & { added?: string[]; removed?: string[] }>({
      url: `feed_targets/${this.feedUrl}/activity_to_targets/`,
      signature: this.signature,
      body,
    });
  }
}
