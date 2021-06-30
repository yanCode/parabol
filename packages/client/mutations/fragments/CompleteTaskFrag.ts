import graphql from 'babel-plugin-relay/macro'
graphql`
  fragment CompleteTaskFrag on Task {
    id
    content
    plaintextContent
    title
    createdAt
    createdBy
    createdByUser {
      preferredName
    }
    dueDate
    integration {
      __typename
      ... on GitHubIssue {
        url
      }
      ... on JiraIssue {
        cloudId
        url
        key
        summary
        descriptionHTML
      }
    }
    meetingId
    sortOrder
    status
    tags
    discussionId
    threadSortOrder
    threadParentId
    updatedAt
    userId
    teamId
    team {
      id
      name
    }
    user {
      id
      preferredName
      picture
    }
  }
`
