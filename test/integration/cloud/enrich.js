var { CloudContext } = require('./utils');

describe('Enrich story', () => {
    let ctx = new CloudContext();
    let eatCheeseBurgerActivity;
    let like;
    let like2;
    let comment;

    ctx.aliceAddsCheeseBurger();

    describe('When alice reads her empty feed', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.alice.feed('user').get();
        });

        ctx.responseShouldHaveNoActivities();
    });

    describe('When alice eats the cheese burger', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.alice.feed('user').addActivity({
                actor: ctx.alice.userId,
                verb: 'eat',
                object: `SC:food:${ctx.cheeseBurger.id}`,
            });
        });
    });

    describe('When alice then reads her feed', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.alice.feed('user').get();
        });

        ctx.responseShouldHaveActivityWithFields();

        ctx.responseShould('have the activity containing enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
            eatCheeseBurgerActivity = ctx.response.results[0];
        });
    });

    describe('When bob reads his empty timeline', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.bob.feed('timeline').get();
        });

        ctx.responseShouldHaveNoActivities();
    });

    describe('When bob follows alice', () => {
        ctx.requestShouldNotError(async () => {
            await ctx.bob.followUser(ctx.alice.user);
        });
    });

    describe('When bob then reads his timeline with own reactions', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.bob.feed('timeline').get();
        });

        ctx.responseShouldHaveActivityWithFields();

        ctx.activityShould('contain enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
        });
    });

    describe('When bob then likes that alice ate the cheese burger', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.bob.react('like', eatCheeseBurgerActivity.id);
            like = ctx.response;
        });

        ctx.responseShouldHaveFields(...ctx.fields.reaction);

        ctx.responseShouldHaveUUID();

        ctx.responseShould('have data matching the request', () => {
            ctx.response.should.deep.include({
                kind: 'like',
                activity_id: eatCheeseBurgerActivity.id,
                user_id: ctx.bob.userId,
            });
            ctx.response.data.should.eql({});
        });
    });

    describe('When bob then reads his timeline with own reactions', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.bob
                .feed('timeline')
                .get({ withOwnReactions: true });
        });

        ctx.responseShouldHaveActivityWithFields('own_reactions');

        ctx.activityShould('contain the enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
        });

        ctx.activityShould('contain the reaction of bob', () => {
            ctx.activity.own_reactions.like.should.eql([like]);
        });
    });

    describe('When bob then reads alice her feed', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.bob
                .feed('user', ctx.alice.userId)
                .get({ withOwnReactions: true });
        });

        ctx.responseShouldHaveActivityWithFields('own_reactions');

        ctx.activityShould('contain the enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
        });

        ctx.activityShould('contain the reaction of bob', () => {
            ctx.activity.own_reactions.like.should.eql([like]);
        });
    });

    describe('When carl then reads alice her feed', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.carl
                .feed('user', ctx.alice.userId)
                .get({ withRecentReactions: true, withOwnReactions: true });
        });

        ctx.responseShouldHaveActivityWithFields(
            'own_reactions',
            'latest_reactions',
        );

        ctx.activityShould('contain the enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
        });

        ctx.activityShould('not contain anything in own_reactions', () => {
            ctx.activity.own_reactions.should.eql({});
        });

        ctx.activityShould(
            'contain the reaction of bob in latest_reactions',
            () => {
                ctx.activity.latest_reactions.like.should.eql([like]);
            },
        );
    });

    describe('When dave also likes that alice ate the cheese burger', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.dave.react('like', eatCheeseBurgerActivity.id);
            like2 = ctx.response;
        });

        ctx.responseShouldHaveFields(...ctx.fields.reaction);

        ctx.responseShouldHaveUUID();

        ctx.responseShould('have data matching the request', () => {
            ctx.response.should.deep.include({
                kind: 'like',
                activity_id: eatCheeseBurgerActivity.id,
                user_id: ctx.dave.userId,
            });
            ctx.response.data.should.eql({});
        });
    });

    describe('When dave then comments on that alice ate a cheeseburger', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.dave.react(
                'comment',
                eatCheeseBurgerActivity,
                {
                    data: {
                        text: 'Looks juicy!!!',
                    },
                },
            );
            comment = ctx.response;
        });

        ctx.responseShouldHaveFields(...ctx.fields.reaction);

        ctx.responseShouldHaveUUID();

        ctx.responseShould('have data matching the request', () => {
            ctx.response.should.deep.include({
                kind: 'comment',
                activity_id: eatCheeseBurgerActivity.id,
                user_id: ctx.dave.userId,
            });
            ctx.response.data.should.eql({
                text: 'Looks juicy!!!',
            });
        });
    });

    describe('When dave then reads alice her feed with all enrichment enabled', () => {
        ctx.requestShouldNotError(async () => {
            ctx.response = await ctx.dave.feed('user', ctx.alice.userId).get({
                withRecentReactions: true,
                withOwnReactions: true,
                withReactionCounts: true,
            });
        });

        ctx.responseShouldHaveActivityWithFields(
            'own_reactions',
            'latest_reactions',
            'reaction_counts',
        );

        ctx.activityShould('contain the enriched data', () => {
            ctx.activity.object.should.eql(ctx.cheeseBurger);
        });

        ctx.activityShould(
            'contain dave his like and comment in own_reactions',
            () => {
                ctx.activity.own_reactions.should.eql({
                    like: [like2],
                    comment: [comment],
                });
            },
        );

        ctx.activityShould(
            'contain his own reactions and of bob his like in latest_reactions',
            () => {
                ctx.activity.latest_reactions.should.eql({
                    like: [like, like2],
                    comment: [comment],
                });
            },
        );

        ctx.activityShould('have the correct counts for reactions', () => {
            ctx.activity.reaction_counts.should.eql({
                like: 2,
                comment: 1,
            });
        });
    });
});
