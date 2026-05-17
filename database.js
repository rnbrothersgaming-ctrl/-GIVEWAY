const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const database = {
    data: {
        polls: [],
        activePollId: null
    },

    load() {
        if (fs.existsSync(DB_PATH)) {
            try {
                const content = fs.readFileSync(DB_PATH, 'utf-8');
                this.data = JSON.parse(content);
            } catch (error) {
                console.error('Error loading database:', error);
            }
        } else {
            this.save();
        }
    },

    save() {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    },

    createPoll(title, options, winnerCount = 1) {
        if (this.data.activePollId) return null; // Prevent creation if one is active

        const poll = {
            id: Date.now().toString(),
            title: title,
            options: options.map(opt => ({ name: opt.trim(), votes: [] })),
            winnerCount: parseInt(winnerCount) || 1,
            channelMsgId: null,
            status: 'active'
        };
        this.data.polls.push(poll);
        this.data.activePollId = poll.id;
        this.save();
        return poll;
    },

    getActivePoll() {
        if (!this.data.activePollId) return null;
        return this.getPoll(this.data.activePollId);
    },

    endPoll(pollId) {
        const poll = this.getPoll(pollId);
        if (!poll) return null;
        poll.status = 'ended';
        this.data.activePollId = null;
        this.save();
        return poll;
    },

    addParticipant(pollId, userId, name) {
        const poll = this.getPoll(pollId);
        if (!poll) return { success: false, message: 'Poll not found' };
        if (poll.status !== 'active') return { success: false, message: 'Poll is not active' };

        // Check if user is already a participant
        const alreadyJoined = poll.options.some(opt => opt.userId === userId);
        if (alreadyJoined) return { success: false, message: 'You have already joined!' };

        poll.options.push({
            name: name,
            userId: userId,
            votes: []
        });
        
        this.save();
        return { success: true, poll };
    },

    removeOption(optionIndex) {
        const poll = this.getActivePoll();
        if (!poll) return { success: false, message: 'No active poll' };
        if (optionIndex < 0 || optionIndex >= poll.options.length) return { success: false, message: 'Invalid option index' };

        const removed = poll.options.splice(optionIndex, 1)[0];
        this.save();
        return { success: true, poll, removed };
    },

    addOptionAdmin(name) {
        const poll = this.getActivePoll();
        if (!poll) return { success: false, message: 'No active poll' };

        const newOption = {
            name: name.trim(),
            votes: []
        };
        poll.options.push(newOption);
        this.save();
        return { success: true, poll, added: newOption };
    },

    addManualVotes(optionIndex, count) {
        const poll = this.getActivePoll();
        if (!poll) return { success: false, message: 'No active poll' };
        if (!poll.options[optionIndex]) return { success: false, message: 'Invalid option index' };

        for (let i = 0; i < count; i++) {
            poll.options[optionIndex].votes.push(`manual_${Date.now()}_${i}`);
        }

        this.save();
        return { success: true, poll };
    },

    getPoll(pollId) {
        return this.data.polls.find(p => p.id === pollId);
    },

    vote(pollId, optionIndex, userId) {
        const poll = this.getPoll(pollId);
        if (!poll) return { success: false, message: 'Poll not found' };

        // Check if user already voted in this poll
        const alreadyVoted = poll.options.some(opt => opt.votes.includes(userId));
        if (alreadyVoted) return { success: false, message: 'You have already voted!' };

        poll.options[optionIndex].votes.push(userId);
        this.save();
        return { success: true, poll };
    },

    removeVote(userId) {
        const poll = this.getActivePoll();
        if (!poll) return null;

        let removedOption = null;
        poll.options.forEach(opt => {
            const index = opt.votes.indexOf(userId);
            if (index !== -1) {
                opt.votes.splice(index, 1);
                removedOption = opt.name;
            }
        });

        if (removedOption) {
            this.save();
            return { poll, removedOption };
        }
        return null;
    }
};

database.load();
module.exports = database;
