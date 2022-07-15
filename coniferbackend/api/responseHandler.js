function responseHandler(data, statusCode) {
	return {
		statusCode: statusCode,
		headers: {
			"Access-Control-Allow-Headers":
				"Content-Type,X-Amz-Date,Authorization,X-Api-Key,x-requested-with",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE,PATCH",
		},
		body: JSON.stringify({
			message: data,
		}),
	};
}

module.exports = responseHandler;